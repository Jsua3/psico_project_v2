import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors, KNOWN_CONSOLE_PATTERNS } from './support/console-gate';
import { apiToken, bearer } from './support/case-fixtures';
import {
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterDoor,
  enterWorld,
  expectNextStep,
  interactNearby,
  reachNearby,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * RN-08 (F10-4) contra el servidor real. Al decidir se lee la CONSECUENCIA y nunca la clasificación ni el mensaje
 * evaluativo; al cerrar, «Tus decisiones» trae la explicación y el fundamento de cada decisión. La prueba no
 * depende de la bandera: con `SIEP_FEEDBACK_AT_CLOSE_ONLY` apagada la respuesta trae la forma heredada (con
 * `feedback`) y el diálogo debe seguir sin leerla; encendida, la respuesta no la trae.
 */
// req: RN-08, RF-23, CU-13, RF-10
test.describe('@feedback RN-08: consecuencia al decidir, retroalimentación al cierre', () => {
  test('la primera decisión se lee como consecuencia y el resultado lista «Tus decisiones» (desktop-1366)', async ({ page }, testInfo) => {
    testInfo.setTimeout(scaled(420_000));
    const input = createWorldInputDriver(page, 'keyboard');
    await enterWorld(page);

    // Hasta la primera decisión: el kit de PAP, la familia, la enfermera y la sala de escucha (como el primer minuto).
    await reachNearby(page, input, 'ArrowLeft', /kit pap/i);
    await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
    await reachNearby(page, input, 'ArrowLeft', /familia en crisis/i);
    await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
    await useToolChoice(page, /abuela de la niña/i, /aplicar pap a la familia en crisis/i);
    await closeDialogue(page, /herramienta pertinente/i);
    // Cada paso espera a que la lista avance: sin esa espera el jugador no recibe las teclas a tiempo (como en guided).
    await expectNextStep(page, 'u1-enfermera');
    await reachNearby(page, input, ['ArrowRight', 'ArrowUp'], /enfermera de urgencias/i);
    await seekNpcDialogue(page, /enfermera de urgencias/i, input);
    await closeDialogue(page, /enfermera de urgencias/i);
    await expectNextStep(page, 'u1-puerta');
    await reachNearby(page, input, ['ArrowRight', 'ArrowDown'], /sala de escucha familiar/i);
    await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
    await expectNextStep(page, 'u1-decidir');
    await reachNearby(page, input, ['ArrowLeft', 'ArrowDown'], /familia en crisis/i);
    await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);

    const decision = await chooseDecision(
      page,
      /abuela de la niña/i,
      /aplicar pap: contención emocional, acompañamiento en duelo/i,
    );

    // Al decidir: la consecuencia narrativa, sin clasificación ni el texto evaluativo del servidor.
    const consequence = page.getByRole('dialog', { name: /consecuencia/i });
    await expect(consequence).toBeVisible({ timeout: scaled(30_000) });
    const shown = (await consequence.textContent()) ?? '';
    expect(shown).not.toMatch(/Decisión adecuada|Decisión con riesgo|Alerta ética/);
    if (decision.consequence) expect(shown).toContain(decision.consequence.text);
    if (decision.feedback?.message) expect(shown).not.toContain(decision.feedback.message);
    if (decision.feedback?.prohibitionReason) expect(shown).not.toContain(decision.feedback.prohibitionReason);
    await closeDialogue(page, /consecuencia/i);
    await waitForWorldReady(page);

    // El resto del caso se completa por la API del propio servidor: la prueba es de la pantalla, no del recorrido.
    const token = await apiToken(page.request, {
      email: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
      password: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
    });
    const caseVersionId = await openedCaseVersionId(page);
    const laterDecisions = await finishCaseByApi(page, token, caseVersionId);

    // Al cierre: «Tus decisiones» lista cada decisión registrada (la de la UI y las de la API), con su explicación o su
    // estado vacío, y su etiqueta formativa. Nunca un puntaje.
    await page.reload();
    const outcome = page.getByRole('alertdialog');
    await expect(outcome).toBeVisible({ timeout: scaled(60_000) });
    const section = outcome.locator('.oc-decisions');
    await expect(section.locator('#oc-decisions-title')).toHaveText('Tus decisiones');
    const items = section.locator('.oc-decision');
    await expect(items).toHaveCount(1 + laterDecisions);
    for (const item of await items.all()) {
      const explained = await item.locator('.oc-decision__explanation').count();
      const empty = await item.locator('.oc-decision__empty').count();
      expect(explained + empty, 'cada decisión explica o dice que no trae explicación').toBe(1);
      await expect(item.locator('.oc-decision__tone')).toHaveText(/^(Adecuada|Con riesgo|Inadecuada)$/);
    }
    expect(await section.textContent()).not.toMatch(/\d+\s*pts|puntos/i);
    await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
  });
});

/** El caso del intento abierto en el navegador (el juego guarda `siep_attempt_<caseVersionId>` al abrirlo). */
async function openedCaseVersionId(page: Page): Promise<number> {
  const key = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const name = sessionStorage.key(i) ?? '';
      if (/^siep_attempt_\d+$/.test(name)) return name;
    }
    return null;
  });
  expect(key, 'el intento abierto queda guardado en el navegador').not.toBeNull();
  return Number(key!.replace('siep_attempt_', ''));
}

/**
 * Registra decisiones por la API hasta que el intento se completa: siempre la primera opción de la escena actual.
 * Devuelve cuántas decisiones registró (las respuestas que el juego no aplicó no cuentan).
 */
async function finishCaseByApi(page: Page, token: string, caseVersionId: number): Promise<number> {
  let registered = 0;
  const trail: string[] = [];
  for (let step = 0; step < 24; step += 1) {
    const active = (await (await page.request.get(
      `/api/simulation/cases/${caseVersionId}/active-attempt`,
      { headers: bearer(token) },
    )).json()).data;
    if (!active || active.status !== 'IN_PROGRESS') return registered;

    // El intento vivo del servidor (no el guardado en el navegador, que puede ser de un paso anterior).
    const response = await page.request.post(`/api/simulation/attempts/${active.attemptId}/decisions`, {
      headers: bearer(token),
      data: {
        attemptToken: active.attemptToken,
        decisionOptionId: active.currentNode.options[0].id,
        evidenceOverride: false,
        missingEvidence: [],
      },
    });
    expect(response.status(), 'decisión por API').toBe(200);
    const data = (await response.json()).data;
    const state = data.attempt ?? data;
    if (!data.retry) registered += 1;
    trail.push(`${active.currentNode.key}#${active.currentNode.options[0].id}→${state.status}${data.retry ? ' (reintento)' : ''}`);
    if (state.status === 'COMPLETED') return registered;
    // Tras un reintento, la misma opción dentro de DUPLICATE_WINDOW_SECONDS (2 s) es un doble clic y el servidor la
    // responde sin gastar la segunda oportunidad: hay que esperar fuera de la ventana antes de reenviarla.
    if (data.retry) await page.waitForTimeout(2500);
  }
  throw new Error(`el caso no se completó en 24 decisiones: ${trail.join(' | ')}`);
}
