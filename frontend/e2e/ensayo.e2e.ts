import { readFileSync } from 'fs';
import { join } from 'path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { readJson } from './support/api-bodies';
import { ADMIN, apiToken, cloneDraft, readEditor, send } from './support/case-fixtures';
import { runAxe } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  interactNearby,
  loginAs,
  loginStudent,
  reachNearby,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * El ensayo de la docente sobre su borrador (bloque B, Tareas 23-24; criterio C7) contra la pila real: abre el borrador
 * clonado de SIM-VBG-001 en el juego real desde una escena, marca en el panel lo explorado, salta a la última escena con
 * decisión y llega al final; con el ensayo descartado por el servidor muestra «Este ensayo ya no existe»; y un estudiante
 * no entra. Todo se busca por atributos, roles y nombres accesibles: el aspecto del juego y del panel lo rediseña otra
 * sesión.
 */
const KEYBOARD = REQUIRED_VIEWPORTS[1];
const BLOCKING = new Set(['serious', 'critical']);
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type Doc = {
  escenas: Array<{ id: string; decision?: { opciones: Array<{ id: string; texto: string }> } }>;
  'x-siep': { escenas: Array<Record<string, any>> };
};
const DOC: Doc = JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-001.dsl.json'), 'utf-8',
));
const optionText = (sceneId: string, optionId: string): string =>
  DOC.escenas.find(s => s.id === sceneId)!.decision!.opciones.find(o => o.id === optionId)!.texto;

/** La respuesta de E01 que pide haber hablado con la enfermera y usado el kit PAP (`requiere` del documento sembrado). */
const HELD_OPTION = (() => {
  const scene = DOC['x-siep'].escenas.find(s => s['clave'] === 'hospital-urgencias')!;
  const option = scene['opciones'].find((o: Record<string, any>) => JSON.stringify(o['requiere'] ?? {}).includes('PAP'))!;
  return { text: optionText(scene['id'], option['id']) };
})();
/** La última escena con decisión (la de la profesional psicosocial) y su sala. */
const LAST_SCENE = (() => {
  const scene = DOC['x-siep'].escenas.find(s => s['clave'] === 'comisaria-accion-final')!;
  return { mapKey: scene['mapa']['clave'] as string };
})();
/** La respuesta que se elige en esa escena: la que no pide nada (`c3-valoracion-dependientes`), con el texto que el juego muestra. */
const LAST_OPTION = /valoración de víctima y dependientes/i;

async function expectNoSeriousAxeViolations(page: Page, state: string, include?: string): Promise<void> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  const blocking = results.violations.filter(violation => violation.impact != null && BLOCKING.has(violation.impact));
  const summary = blocking.map(violation =>
    `[${violation.impact}] ${violation.id}: ${violation.help}\n${violation.nodes.map(node => `${node.target.join(' ')} :: ${node.failureSummary ?? node.html}`).join('\n')}`,
  ).join('\n\n');
  expect(blocking, `${state}: Axe, infracciones serias\n${summary}`).toEqual([]);
}

test.describe(`ensayo-${KEYBOARD.name}`, () => {
  test.use({ viewport: { width: KEYBOARD.width, height: KEYBOARD.height } });

  test('@ensayo la docente abre su borrador desde una escena, marca lo explorado, llega al final y, si el ensayo se descarta, lo empieza de nuevo', async ({ page, request, browser }) => {
    test.setTimeout(scaled(420_000));
    const student = await apiToken(request, {
      email: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
      password: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
    });
    const cases = (await (await request.get('/api/simulation/cases', { headers: { Authorization: `Bearer ${student}` } })).json())
      .data as Array<{ caseVersionId: number }>;
    const draft = await cloneDraft(request, cases[0].caseVersionId);
    const scene = (key: string) => {
      const node = draft.nodes.find(n => n.key === key);
      expect(node, `el borrador clonado trae la escena «${key}» del documento sembrado`).toBeTruthy();
      return node!;
    };
    const e01 = scene('hospital-urgencias');
    const e02 = scene('hospital-sala-escucha');
    const e06 = scene('comisaria-accion-final');
    const url = `/portal/casos/${draft.id}/ensayo?desde=${e01.id}`;
    const input = createWorldInputDriver(page, KEYBOARD.inputMode);
    const panel = page.getByRole('complementary', { name: /panel de autora/i });
    const patched = () => page.waitForResponse(
      r => r.request().method() === 'PATCH' && /\/rehearsal\/[^/]+$/.test(new URL(r.url()).pathname), { timeout: scaled(30_000) },
    );

    // 1. El administrador abre el borrador en la escena E01: modo ensayo, sin aviso ni introducción, y la respuesta retenida.
    await loginAs(page, ADMIN);
    await page.goto(url);
    await expect(page.locator('.game-container')).toHaveAttribute('data-rehearsal', 'true', { timeout: scaled(30_000) });
    await waitForWorldReady(page);
    await expect(page.getByRole('dialog').filter({ hasText: /antes de entrar al caso|antes de comenzar/i })).toHaveCount(0);
    await expect(panel).toBeVisible();
    const held = panel.locator('p', { hasText: HELD_OPTION.text });
    await expect(held).toContainText(/le falta:/i);
    await expect(held).toContainText(/enfermera/i);
    await expect(held).toContainText(/pap/i);
    await expectNoSeriousAxeViolations(page, 'el panel de autora abierto', 'app-rehearsal-panel');

    // 2. Marca la persona y la herramienta que faltan: la respuesta sale de «Por qué no aparece» y el servidor dice que se ofrece.
    let block: any;
    for (const name of [/^hablar con enfermera de urgencias/i, /^usar .*(pap|primeros auxilios)/i]) {
      const response = patched();
      const box = panel.getByRole('checkbox', { name });
      await expect(box, `el panel ofrece marcar ${name}; ofrece: ${(await panel.locator('label').allTextContents()).map(t => t.trim()).join(' | ')}`).toHaveCount(1);
      await box.check();
      block = (await readJson(await response)).data.rehearsal;
      await waitForWorldReady(page);
    }
    expect(block.options.find((o: { text: string }) => o.text === HELD_OPTION.text), 'el PATCH dice que la respuesta ya se ofrece')
      .toMatchObject({ offered: true });
    await expect(panel.locator('p', { hasText: HELD_OPTION.text })).toHaveCount(0);

    // 3. «Ir a esta escena»: la última con decisión; el jugador camina hasta la profesional y elige: llega el final.
    const move = patched();
    await panel.getByRole('combobox', { name: /escena/i }).selectOption({ label: e06.title });
    await panel.getByRole('button', { name: /ir a esta escena/i }).click();
    expect((await readJson(await move)).data.rehearsal.sceneId).toBe(e06.id);
    // El escenario base y la sala pueden diferir (`comisaria-consultorio` / `comisaria-consultorio-marco`): se espera la sala.
    await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]')).toHaveAttribute('data-rendered-map-key', LAST_SCENE.mapKey, { timeout: scaled(45_000) });
    await reachNearby(page, input, 'ArrowRight', /profesional psicosocial/i);
    await interactNearby(page, /profesional psicosocial/i, /\/interactions\/profesional-psicosocial$/);
    await chooseDecision(page, /profesional psicosocial/i, LAST_OPTION);
    await closeDialogue(page, /consecuencia/i);
    const outcome = page.getByRole('alertdialog');
    await expect(outcome).toBeVisible({ timeout: scaled(30_000) });
    await expect(outcome).toContainText('Respuestas que no llegaste a ver');
    await expect(outcome.getByRole('button', { name: /empezar de nuevo/i })).toBeVisible();
    await expect(outcome.getByRole('link', { name: /volver al editor/i })).toBeVisible();

    // 4. Foco 4: con el ensayo abierto otra vez, la docente borra (por la API) una respuesta de otra escena.
    await page.goto(url);
    await expect(page.locator('.game-container')).toHaveAttribute('data-rehearsal', 'true', { timeout: scaled(30_000) });
    await waitForWorldReady(page);
    const admin = await apiToken(request, ADMIN);
    const view = await readEditor(request, admin, draft.id);
    const victim = (view['decisions'] as Array<Record<string, any>>).find(d => d['sourceNodeId'] === e02.id);
    expect(victim, 'el borrador trae una respuesta en la escena E02').toBeTruthy();
    await send(request, admin, 'delete', `/api/authoring/cases/${draft.id}/decisions/${victim!['id']}`, {}, 'borrar una respuesta de otra escena');
    await panel.getByRole('button', { name: /recargar borrador/i }).click();
    await expect(page.locator('app-rehearsal-gone').getByText('Este ensayo ya no existe', { exact: false })).toBeVisible({ timeout: scaled(15_000) });
    await expect(panel).toHaveCount(0);
    await page.getByRole('button', { name: /empezar de nuevo/i }).click();
    await expect(page.locator('.game-container')).toHaveAttribute('data-rehearsal', 'true', { timeout: scaled(30_000) });
    await waitForWorldReady(page);
    await expect(panel).toBeVisible();
    // La tarjeta se fue (el anunciador de lectores de pantalla conserva su último aviso: no cuenta).
    await expect(page.locator('app-rehearsal-gone')).toHaveCount(0);

    // 5. Un estudiante que abre la misma dirección va a «Sin permiso».
    const context = await browser.newContext({ viewport: { width: KEYBOARD.width, height: KEYBOARD.height } });
    try {
      const other = await context.newPage();
      await loginStudent(other);
      await other.goto(url);
      await expect(other).toHaveURL(/\/portal\/sin-permiso/);
      await expect(other.getByRole('heading', { name: 'Esta sección no es para tu rol' })).toBeVisible();
      await expect(other.locator('.game-container')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
