import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors, KNOWN_CONSOLE_PATTERNS } from './support/console-gate';
import { classValuesIn, measuresIn, measuresInText, recordSimulationResponses, retiredKeysIn, shapeOf } from './support/no-numbers';
import { assertQualityState } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  enterDoor,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  moveAndPersistPosition,
  pauseWithPendingPosition,
  reachNearby,
  reloadAndResumeAttempt,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

type RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];

/**
 * Los dos recorridos del caso SIM-VBG-001 (modelo de métricas, Tarea 22):
 * - `recommended`: la respuesta Recomendada en las seis escenas → todos los hitos decisivos y el final «protectora».
 * - `contraindicated`: igual, salvo que en la escena de la valoración el estudiante elige la mediación con el agresor
 *   (Contraindicada). La primera vez el juego no la aplica (segunda oportunidad); la segunda queda registrada. Faltan
 *   dos hitos decisivos y el final es «critica».
 */
type CaseRoute = 'recommended' | 'contraindicated';

/** Las claves del modelo numérico viejo que el reporte de cierre ya no puede traer. */
const RETIRED_REPORT_KEYS = ['finalScore', 'finalStress', 'metrics', 'competencies', 'adequateDecisions', 'riskyDecisions'];

/** Lo que el estudiante lee en una pantalla no trae porcentajes, puntaje, estrés, ranking ni desempeño. */
async function expectNoMeasuresOnScreen(where: string, locator: Locator, ignore: string[] = []): Promise<void> {
  const text = await locator.evaluate((element, selectors) => {
    const clone = element.cloneNode(true) as HTMLElement;
    for (const selector of selectors) clone.querySelectorAll(selector).forEach(node => node.remove());
    const bars = clone.querySelectorAll('[role="progressbar"], [role="meter"], progress, meter').length;
    return `${clone.textContent ?? ''}${bars > 0 ? ' [barra de avance]' : ''}`;
  }, ignore);
  expect(measuresInText(text), `${where}: el estudiante no debe leer cifras de desempeño`).toEqual([]);
  expect(text, `${where}: sin barra de avance ni medidor`).not.toContain('[barra de avance]');
}

/** La salida segura sigue pausando de verdad y «Reanudar» devuelve al mismo intento; la pausa tampoco trae cifras. */
async function pauseAndResumeWithSafeExit(page: Page, attemptId: string): Promise<void> {
  const exit = page.getByRole('button', { name: /salida segura/i });
  await expect(exit).toHaveCount(1);
  const paused = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await exit.click({ timeout: scaled(10_000) });
  const pausedBody = (await (await paused).json()).data;
  expect(pausedBody.attemptId).toBe(attemptId);
  expect(pausedBody.status).toBe('PAUSED');
  const pauseDialog = page.getByRole('alertdialog', { name: /pausa/i });
  await expect(pauseDialog).toBeVisible({ timeout: scaled(30_000) });
  await expect(pauseDialog).toHaveAttribute('aria-modal', 'true');
  await expectNoMeasuresOnScreen('la pausa', pauseDialog);

  const resumed = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await page.getByRole('button', { name: /reanudar este intento/i }).click();
  const resumedBody = (await (await resumed).json()).data;
  expect(resumedBody.attemptId).toBe(attemptId);
  expect(resumedBody.status).toBe('IN_PROGRESS');
  await expect(pauseDialog).toBeHidden({ timeout: scaled(30_000) });
  await waitForWorldReady(page);
}

async function completeFullCase(
  page: Page,
  testInfo: TestInfo,
  viewport: RequiredViewport,
  route: CaseRoute,
): Promise<void> {
  // 1,6-2,9 min en local; con E2E_TIME_SCALE=4 (runner sin GPU) son 20 min.
  testInfo.setTimeout(scaled(300_000));
  const input = createWorldInputDriver(page, viewport.inputMode);
  // Cada respuesta de /api/simulation/** que recibe el navegador se revisa al final (la regla de la Tarea 17).
  const recorder = recordSimulationResponses(page);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });

  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);

  // El HUD dice quién es la persona con palabras (vínculo y activación) y no trae cifras; Axe sin infracciones serias.
  const hud = page.getByRole('complementary', { name: /indicadores del simulador/i });
  await expect(hud).toBeVisible();
  await expect(hud.locator('.hud-persona-label')).not.toHaveText('');
  await expectNoMeasuresOnScreen('el HUD', hud);
  await assertQualityState(page, testInfo, `${viewport.name}-${route}-hud`);

  // Hospital — evidencia de H1: PAP + familia inspeccionada + enfermera registrada.
  await input.moveUntilNearby('ArrowLeft', /kit pap/i);
  const pap = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
  expect(pap.world.inventory).toContain('PAP');

  await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
  const papUse = await useToolChoice(
    page,
    /abuela de la niña/i,
    /aplicar pap a la familia en crisis/i,
  );
  expect(papUse.pertinent).toBe(true);
  expect(papUse.world.usedToolKeys).toContain('PAP@familia-crisis');
  await closeDialogue(page, /herramienta pertinente/i);

  // La enfermera aparece en la barra («Hablar con Enfermera de urgencias»): se
  // la busca en diagonal hacia arriba y a la derecha, sin conocer su posición.
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp'], /enfermera de urgencias/i);
  await seekNpcDialogue(page, /enfermera de urgencias/i, input);
  await closeDialogue(page, /enfermera de urgencias/i);

  // Hacia la puerta por el pasillo frontal, rodeando la camilla.
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown'], /sala de escucha familiar/i);
  const escuchaEntry = await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
  expect(escuchaEntry.player).toMatchObject({ x: 160, y: 452 });

  // H1 — contención con PAP.
  await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
  let decision = await chooseDecision(
    page,
    /abuela de la niña/i,
    /aplicar pap: contención emocional, acompañamiento en duelo/i,
  );
  expect(decision.currentNode.key).toBe('hospital-sala-escucha');
  await closeDialogue(page, /consecuencia/i);
  await waitForWorldReady(page);

  // La primera decisión Recomendada deja a la persona abierta y serena: se dice en palabras y sobrevive a todo.
  expect(decision.persona).toMatchObject({ bond: 'OPEN', activation: 'CALM' });
  expect(decision.persona.label).toEqual(expect.any(String));
  const persona = decision.persona;

  // Persistencia — refresh en progreso y pausa inmediata conservan el mismo intento.
  const attemptId = decision.attemptId as string;
  const beforeRefresh = await moveAndPersistPosition(page, input, 'ArrowRight', 36);
  const refreshed = await reloadAndResumeAttempt(page, 'IN_PROGRESS', 'hospital-sala-escucha');
  expect(refreshed.activeAttempt.attemptId).toBe(attemptId);
  expect(refreshed.activeAttempt.currentNode.key).toBe('hospital-sala-escucha');
  expect(refreshed.activeAttempt.persona).toEqual(persona);
  expect(refreshed.world.player).toEqual(beforeRefresh.player);
  expect(refreshed.world.inventory).toContain('PAP');
  expect(refreshed.world.usedToolKeys).toContain('PAP@familia-crisis');
  expect(refreshed.world.inspectedObjectKeys).toContain('familia-crisis');
  expect(refreshed.world.flags.viewedNpcKeys).toContain('enfermera-urgencias');

  const paused = await pauseWithPendingPosition(page, input, 'ArrowRight');
  expect(paused.pausedAttempt.attemptId).toBe(attemptId);
  expect(paused.pausedAttempt.status).toBe('PAUSED');
  expect(paused.pausedAttempt.currentNode.key).toBe('hospital-sala-escucha');
  expect(paused.pausedAttempt.persona).toEqual(persona);
  await expect(page.getByRole('alertdialog', { name: /pausa/i })).toBeVisible({ timeout: scaled(30_000) });

  const resumed = await reloadAndResumeAttempt(page, 'PAUSED', 'hospital-sala-escucha');
  expect(resumed.activeAttempt.attemptId).toBe(attemptId);
  expect(resumed.resumedAttempt).toMatchObject({ attemptId, status: 'IN_PROGRESS' });
  expect(resumed.resumedAttempt?.persona).toEqual(persona);
  expect(resumed.world.player).toEqual(paused.positionWorld.player);
  expect(resumed.world.inventory).toContain('PAP');
  expect(resumed.world.usedToolKeys).toContain('PAP@familia-crisis');
  expect(resumed.world.inspectedObjectKeys).toContain('familia-crisis');
  expect(resumed.world.flags.viewedNpcKeys).toContain('enfermera-urgencias');

  // H2 — marco normativo hospitalario.
  await input.moveUntilNearby('ArrowRight', /bitácora/i);
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-hospital$/);
  decision = await chooseDecision(
    page,
    /marco normativo y técnico/i,
    /resolución 459 de 2012 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('hospital-accion-etica');
  await closeDialogue(page, /consecuencia/i);
  await waitForWorldReady(page);

  // H3 — protocolo EPICEE antes de la actuación integral.
  await input.moveUntilNearby('ArrowUp', /protocolo epicee/i);
  const spikes = await interactNearby(page, /protocolo epicee/i, /\/interactions\/tool-spikes$/);
  expect(spikes.world.inventory).toContain('SPIKES');
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowDown'], /psicóloga hospitalaria/i);
  await interactNearby(page, /psicóloga hospitalaria/i, /\/interactions\/psicologa-acompanante$/);
  decision = await chooseDecision(
    page,
    /psicóloga hospitalaria/i,
    /pap \+ escucha \+ epicee\/spikes \+ evaluación psicosocial familiar/i,
  );
  expect(decision.currentNode.key).toBe('hospital-cierre-bloque');
  await closeDialogue(page, /consecuencia/i);
  await waitForWorldReady(page);

  await input.moveUntilNearby('ArrowRight', /salida institucional/i);
  await enterDoor(page, /salida institucional/i, 'comisaria-recepcion');

  // Recepción — expediente antes del consultorio.
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp'], /expediente del caso/i);
  await interactNearby(page, /expediente del caso/i, /\/interactions\/expediente-caso$/);
  await closeDialogue(page, /expediente del caso/i);
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown'], /consultorio/i);
  await enterDoor(page, /consultorio/i, 'comisaria-consultorio');

  // C1 — valoración de riesgo y protección.
  await input.moveUntilNearby('ArrowRight', /valoración de riesgo/i);
  const riskTool = await interactNearby(page, /valoración de riesgo/i, /\/interactions\/tool-riesgo$/);
  expect(riskTool.world.inventory).toContain('RISK_METER');
  await input.moveUntilNearby('ArrowLeft', /sobreviviente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  const structuredRiskUse = await useToolChoice(
    page,
    /sobreviviente \(22 años\)/i,
    /aplicar valoración estructurada de riesgo de feminicidio/i,
  );
  expect(structuredRiskUse.pertinent).toBe(true);
  expect(structuredRiskUse.world.usedToolKeys)
    .toContain('RISK_METER@sobreviviente-consulta');
  await closeDialogue(page, /herramienta pertinente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  if (route === 'recommended') {
    decision = await chooseDecision(
      page,
      /sobreviviente \(22 años\)/i,
      /valorar riesgo de feminicidio \+ medidas de protección \+ derechos/i,
    );
  } else {
    // Contraindicada (mediación con el agresor): la primera vez el juego no la aplica y concede otra oportunidad. La
    // respuesta no dice si estuvo bien o mal: solo que se puede volver a elegir.
    const retried = await chooseDecision(page, /sobreviviente \(22 años\)/i, /instar a escuchar al agresor/i);
    expect(retried.retry).toMatchObject({ allowed: true });
    expect(retried.consequence).toBeNull();
    expect(retried.currentNode.key).toBe('hospital-cierre-bloque');
    expect(retried.completionReport).toBeNull();
    await closeDialogue(page, /consecuencia/i);

    // La salida segura sigue pausando y reanudar vuelve al mismo intento, con la segunda oportunidad ya gastada.
    await pauseAndResumeWithSafeExit(page, attemptId);

    await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
    decision = await chooseDecision(page, /sobreviviente \(22 años\)/i, /instar a escuchar al agresor/i);
    expect(decision.retry).toBeNull();
  }
  expect(decision.currentNode.key).toBe('comisaria-consultorio');
  expect(decision.consequence).toMatchObject({ text: expect.any(String) });
  await closeDialogue(page, /consecuencia/i);
  await waitForWorldReady(page);

  // C2 — marco integral de Comisaría.
  await input.moveUntilNearby('ArrowRight', /ruta de protección/i);
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp'], /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-comisaria$/);
  decision = await chooseDecision(
    page,
    /marco normativo y técnico/i,
    /ley 2126 de 2021 \+ ley 1098 de 2006 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-accion-final');
  await closeDialogue(page, /consecuencia/i);
  await waitForWorldReady(page);

  // C3 — cierre técnico y reporte integral. Tras C2 la Ruta de protección aún
  // puede estar en rango: la interacción se busca por su nombre (la barra ofrece
  // el principal y un secundario), no por el orden en que aparecen.
  await input.moveUntilNearby('ArrowRight', /profesional psicosocial/i);
  await interactNearby(page, /profesional psicosocial/i, /\/interactions\/profesional-psicosocial$/);

  // Antes de la última decisión ninguna respuesta del servidor ha llevado la clase de una respuesta.
  await recorder.settled();
  expect(classValuesIn(recorder.records), 'la clase de una respuesta viajó antes de cerrar el caso').toEqual([]);

  decision = await chooseDecision(
    page,
    /profesional psicosocial/i,
    /lo anterior \+ nivel de vulneración de derechos \+ valoración de feminicidio \+ rutas/i,
  );

  expect(decision.status).toBe('COMPLETED');
  expect(decision.currentNode.key).toBe('cierre-caso');

  // El reporte congelado v3: el final por hitos y clases, sin una sola clave del modelo numérico viejo.
  const report = decision.completionReport;
  expect(report.schemaVersion).toBe(3);
  for (const key of RETIRED_REPORT_KEYS) {
    expect(report, `el reporte de cierre no trae «${key}»`).not.toHaveProperty(key);
  }
  expect(report.ending.reason.length).toBeGreaterThan(0);
  if (route === 'recommended') {
    expect(report.ending.key).toBe('protectora');
    expect(report.milestones.missing).toEqual([]);
    expect(report.counts).toMatchObject({ recommended: 6, acceptable: 0, risky: 0, contraindicated: 0, retries: 0 });
    expect(report.persona).toMatchObject({ bond: 'OPEN', activation: 'CALM' });
  } else {
    // Una Contraindicada y faltan dos hitos decisivos: asesoría de derechos y medidas de protección.
    expect(report.ending.key).toBe('critica');
    expect(report.milestones.missing.every((milestone: { decisive: boolean }) => milestone.decisive)).toBe(true);
    expect(report.milestones.missing.map((milestone: { key: string }) => milestone.key).sort())
      .toEqual(['asesoria_derechos_realizada', 'medidas_proteccion_activadas']);
    expect(report.counts).toMatchObject({
      recommended: 5, acceptable: 0, risky: 0, contraindicated: 1, retries: 1, prohibitedRetries: 1,
    });
  }

  // AC-9: la consecuencia de la ÚLTIMA decisión se mantiene a la vista y el
  // resultado del intento solo se abre cuando se cierra.
  const supervision = page.getByRole('dialog', { name: /consecuencia/i });
  await expect(supervision).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.locator('app-attempt-outcome .outcome')).toHaveCount(0);
  await assertQualityState(page, testInfo, `${viewport.name}-${route}-last-supervision`);
  await closeDialogue(page, /consecuencia/i);

  const outcome = page.getByRole('alertdialog', { name: /intento finalizado/i });
  await expect(outcome).toBeVisible({ timeout: scaled(30_000) });

  // El final y su razón en palabras; los hitos cumplidos y los que faltaron; la persona al cerrar.
  const ending = outcome.locator('.oc-ending');
  await expect(ending.locator('.oc-ending__title')).toHaveText(report.ending.title);
  await expect(ending).toHaveAttribute('data-tone', report.ending.tone);
  await expect(ending.locator('.oc-ending__reasons li')).toHaveCount(report.ending.reason.length);
  await expect(ending.locator('.oc-ending__persona')).toContainText(report.persona.label);
  await expect(outcome.locator('.oc-milestones__col--done li')).toHaveCount(report.milestones.done.length);
  await expect(outcome.locator('.oc-milestones__col--missing li')).toHaveCount(report.milestones.missing.length);
  for (const milestone of report.milestones.missing as { label: string }[]) {
    await expect(outcome.locator('.oc-milestones__col--missing')).toContainText(milestone.label);
  }
  await expect(outcome.getByRole('button', { name: /reintentar caso/i })).toBeVisible();
  await expect(outcome.getByRole('link', { name: /volver al simulador/i })).toBeVisible();
  if (route === 'contraindicated') {
    await expect(outcome.locator('.oc-chips')).toContainText('Reconsideradas: 1');
  }

  // F10-4 (RN-08): «Tus decisiones» lista las seis decisiones con su explicación o su estado vacío, y la clase de
  // cada respuesta en palabras (nunca un puntaje).
  const decisions = outcome.locator('.oc-decisions');
  await expect(decisions.locator('#oc-decisions-title')).toHaveText('Tus decisiones', { timeout: scaled(30_000) });
  const items = decisions.locator('.oc-decision');
  await expect(items).toHaveCount(6, { timeout: scaled(30_000) });
  for (const item of await items.all()) {
    expect(await item.locator('.oc-decision__explanation, .oc-decision__empty').count()).toBe(1);
    await expect(item.locator('.oc-decision__tone')).toHaveText(/^(Recomendada|Aceptable|Con riesgo|Contraindicada)$/);
  }
  const contraindicated = route === 'contraindicated' ? 1 : 0;
  await expect(decisions.locator('.oc-decision__tone', { hasText: /^Contraindicada$/ })).toHaveCount(contraindicated);
  await expect(decisions.locator('.oc-decision__tone', { hasText: /^Recomendada$/ })).toHaveCount(6 - contraindicated);
  await expect(decisions.locator('.oc-decision__note')).toHaveCount(contraindicated);

  // Ninguna cifra en el cierre (la línea de tiempo trae horas, no medidas).
  await expectNoMeasuresOnScreen('el cierre', outcome, ['.oc-timeline']);
  await assertQualityState(page, testInfo, `${viewport.name}-${route}-outcome`);

  // F6-6 (H-05): el resultado es un diálogo modal con el foco inicial en su título, y a 360 px los hitos, el final y
  // la línea de tiempo caben sin desplazamiento horizontal.
  await expect(outcome).toHaveAttribute('aria-modal', 'true');
  await expect(outcome.locator('#outcome-title')).toBeFocused();
  const original = page.viewportSize();
  await page.setViewportSize({ width: 360, height: original?.height ?? 800 });
  await expect.poll(
    () => outcome.evaluate(element => element.scrollWidth - element.clientWidth),
    { message: 'el resultado no se desplaza en horizontal a 360 px', timeout: scaled(5_000) },
  ).toBeLessThanOrEqual(0);
  if (original) await page.setViewportSize(original);

  // La regla de la Tarea 17 vista desde el navegador: ninguna respuesta de /api/simulation/** trajo una clave del
  // modelo numérico viejo ni un número que no sea un id, un hecho, una duración o una posición.
  await recorder.settled();
  recorder.stop();
  const seen = new Set(recorder.records.map(record => shapeOf(record.where)));
  expect(seen.has('POST /api/simulation/attempts/{id}/decisions'), 'se grabaron las decisiones').toBe(true);
  expect(seen.has('GET /api/simulation/attempts/{id}/world'), 'se grabó el mundo').toBe(true);
  expect(retiredKeysIn(recorder.records), 'claves del modelo numérico viejo en las respuestas').toEqual([]);
  expect(measuresIn(recorder.records), 'números que no son id, hecho, duración ni posición').toEqual([]);

  // E5-8 · TOO-7: ningún `pageerror` ni `console.error` inesperado en todo el recorrido.
  await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
}

for (const viewport of REQUIRED_VIEWPORTS) {
  test.describe(`full-case-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@full-case completes all six recommended decisions (${viewport.name})`, async ({ page }, testInfo) =>
      completeFullCase(page, testInfo, viewport, 'recommended'));
  });
}

// El recorrido con una Contraindicada corre en un viewport de teclado y en uno táctil: el resto del caso es el mismo.
for (const viewport of REQUIRED_VIEWPORTS.filter(item => item.name === 'desktop-1600' || item.name === 'mobile-390')) {
  test.describe(`full-case-contraindicated-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@full-case plays one contraindicated response and closes with the critical ending (${viewport.name})`, async ({ page }, testInfo) =>
      completeFullCase(page, testInfo, viewport, 'contraindicated'));
  });
}
