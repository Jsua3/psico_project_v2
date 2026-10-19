import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { PROFESOR, apiToken, readEditor, send } from './support/case-fixtures';
import { assertQualityState, runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Datos del caso en el editor (plan visual F10-3†; E3-3 a E3-7, RF-06 a RF-11, RF-07, RF-16, CU-04), contra el servidor
 * REAL de la base desechable: la docente autora ayudas, la retroalimentación y el fundamento de una decisión, el texto de
 * una conclusión, el orden de las escenas (con teclado) y la ficha con sus personajes; cada cosa queda guardada en el
 * servidor y las pestañas nuevas y sus hojas cumplen Axe y la geometría en móvil y en escritorio.
 */
type Json = Record<string, any>;

const A = '/api/authoring/cases';
const NODE_BODY = {
  requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false,
  warningMessage: null, terminal: false, startNode: false, positionX: null, positionY: null,
};
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Seed { id: number; title: string; token: string; mapId: number; nodes: Record<string, number> }

/** Un borrador de la docente con tres escenas (inicio, consulta y una conclusión), una decisión, una ficha y un personaje. */
async function seedDraft(request: APIRequestContext, label: string, options: { hints?: string[] } = {}): Promise<Seed> {
  const token = await apiToken(request, PROFESOR);
  const title = `${label} ${Date.now()}`;
  const created = await send(request, token, 'post', A, { title }, 'crear el caso');
  const id: number = created['caseVersionId'];
  const startId: number = created['nodes'][0]['id'];
  const mapId: number = created['maps'][0]['id'];
  await send(request, token, 'post', `${A}/${id}/nodes`, {
    ...NODE_BODY, nodeKey: 'consulta', title: 'Consulta', narrative: 'La persona cuenta lo que le pasa.',
  }, 'segunda escena');
  const view = await send(request, token, 'post', `${A}/${id}/nodes`, {
    ...NODE_BODY, nodeKey: 'cierre', title: 'Cierre del caso', narrative: 'Fin.', terminal: true,
  }, 'conclusión');
  const nodes = Object.fromEntries((view['nodes'] as Json[]).map(node => [node['key'], node['id']])) as Record<string, number>;
  await send(request, token, 'post', `${A}/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: nodes['consulta'], optionKey: 'escuchar', text: 'Escuchar con atención',
    classification: 'ADEQUATE', prohibitedConduct: false, prohibitionReason: null, scoreDelta: 10, stressDelta: 0,
    prohibitedPenalty: 0, immediateFeedback: '',
  }, 'decisión');
  await send(request, token, 'put', `${A}/${id}/brief`, {
    context: 'Una mujer llega a urgencias.', learningObjectives: ['Validar sin juzgar.'],
  }, 'ficha');
  await send(request, token, 'post', `${A}/${id}/characters`, {
    characterKey: 'marta', displayName: 'Marta', roleLabel: 'Enfermera de urgencias', portraitKey: '', showInBrief: true, displayOrder: 0,
  }, 'personaje');
  for (const [index, text] of (options.hints ?? []).entries()) {
    await send(request, token, 'post', `${A}/${id}/maps/${mapId}/hints`, { text, hintOrder: index + 1 }, `ayuda ${index + 1}`);
  }
  return { id, title, token, mapId, nodes };
}

async function nodeField(request: APIRequestContext, seed: Seed, key: string, field: string): Promise<unknown> {
  const view = await readEditor(request, seed.token, seed.id);
  return (view['nodes'] as Json[]).find(node => node['key'] === key)?.[field];
}

const toast = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);

async function openEditor(page: Page, seed: Seed): Promise<void> {
  await loginAs(page, 'profesor');
  await page.goto(`/portal/casos/${seed.id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: seed.title })).toBeVisible({ timeout: scaled(30_000) });
}

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

// req: RF-11, CU-04
test('la docente agrega, edita y quita una ayuda de una sala, y el servidor la guarda', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const seed = await seedDraft(request, 'Ayudas e2e');
  await openEditor(page, seed);
  await page.getByRole('tab', { name: 'Ayudas' }).click();
  await expect(page.getByText('Esta sala aún no tiene ayudas.')).toBeVisible();

  // Agregar: la hoja nombra la sala, abre con el foco en el texto y no envía una ayuda vacía.
  await page.getByRole('button', { name: 'Agregar ayuda a «Escena inicial»' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nueva ayuda' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Sala «Escena inicial»')).toBeVisible();
  await expect(sheet.getByLabel('Texto de la ayuda')).toBeFocused();
  await sheet.getByRole('button', { name: 'Guardar ayuda' }).click();
  await expect(sheet.getByText('Escribe el texto de la ayuda.')).toBeVisible();
  await expect(sheet.getByLabel('Texto de la ayuda')).toBeFocused();
  expect((await readEditor(request, seed.token, seed.id))['hints']).toEqual([]);

  await sheet.getByLabel('Texto de la ayuda').fill('Mira cómo respira y cómo te mira.');
  await sheet.getByRole('button', { name: 'Guardar ayuda' }).click();
  await expect(toast(page, 'Ayuda guardada.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(sheet).toBeHidden();
  await expect(page.locator('.ch-text')).toHaveText(['Mira cómo respira y cómo te mira.']);
  await expect(page.locator('app-case-hints ui-badge')).toHaveText('1 ayuda');
  let hints = (await readEditor(request, seed.token, seed.id))['hints'] as Json[];
  expect(hints.map(item => [item['mapId'], item['text']])).toEqual([[seed.mapId, 'Mira cómo respira y cómo te mira.']]);

  // Editar: parte del texto guardado.
  await page.getByRole('button', { name: 'Editar ayuda 1 de «Escena inicial»' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar ayuda' });
  await expect(edit.getByLabel('Texto de la ayuda')).toHaveValue('Mira cómo respira y cómo te mira.');
  await edit.getByLabel('Texto de la ayuda').fill('Pregunta por el sueño de las últimas noches.');
  await edit.getByRole('button', { name: 'Guardar ayuda' }).click();
  await expect(toast(page, 'Ayuda guardada.').first()).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.ch-text')).toHaveText(['Pregunta por el sueño de las últimas noches.']);
  hints = (await readEditor(request, seed.token, seed.id))['hints'] as Json[];
  expect(hints.map(item => item['text'])).toEqual(['Pregunta por el sueño de las últimas noches.']);

  // Quitar: pide confirmar con el texto de la ayuda; cancelar no quita nada.
  await page.getByRole('button', { name: 'Eliminar ayuda 1 de «Escena inicial»' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Eliminar ayuda' });
  // El diálogo nombra la ayuda con sus primeras palabras (el texto completo puede ser largo).
  await expect(confirm).toContainText('Pregunta por el sueño de las');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect(((await readEditor(request, seed.token, seed.id))['hints'] as Json[])).toHaveLength(1);
  await page.getByRole('button', { name: 'Eliminar ayuda 1 de «Escena inicial»' }).click();
  await page.getByRole('alertdialog', { name: 'Eliminar ayuda' }).getByRole('button', { name: 'Eliminar' }).click();
  await expect(toast(page, 'Ayuda eliminada.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.getByText('Esta sala aún no tiene ayudas.')).toBeVisible();
  expect(((await readEditor(request, seed.token, seed.id))['hints'] as Json[])).toEqual([]);
});

// req: RF-06, RF-09, RF-10, CU-04
test('la docente escribe la consecuencia, la retroalimentación y el fundamento de una decisión, el enunciado y la conclusión', async ({ page, request }) => {
  test.setTimeout(scaled(150_000));
  const seed = await seedDraft(request, 'Textos e2e');
  await openEditor(page, seed);

  // La decisión: sus tres textos nuevos, con sus ayudas, se guardan y se leen de nuevo al reabrir.
  await page.getByRole('button', { name: /^inicio / }).click();
  await page.getByRole('button', { name: 'Editar decisión: Escuchar con atención' }).click();
  const decision = page.getByRole('dialog', { name: 'Editar decisión' });
  await expect(decision.getByText('Por qué esta opción es adecuada o no, explicado para quien aprende.')).toBeVisible();
  await decision.getByLabel('Consecuencia en la historia').fill('Ella respira más tranquila y empieza a hablar.');
  await decision.getByLabel('Retroalimentación pedagógica').fill('Validar sin juzgar sostiene la alianza terapéutica.');
  await decision.getByLabel('Fundamento teórico').fill('Rogers (1957): condiciones de la relación de ayuda.');
  await decision.getByRole('button', { name: 'Guardar decisión' }).click();
  await expect(toast(page, 'Decisión guardada.')).toBeVisible({ timeout: scaled(15_000) });
  const view = await readEditor(request, seed.token, seed.id);
  expect((view['decisions'] as Json[])[0]).toMatchObject({
    consequenceText: 'Ella respira más tranquila y empieza a hablar.',
    feedbackText: 'Validar sin juzgar sostiene la alianza terapéutica.',
    theoryBasis: 'Rogers (1957): condiciones de la relación de ayuda.',
  });
  await page.getByRole('button', { name: 'Editar decisión: Escuchar con atención' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar decisión' }).getByLabel('Fundamento teórico'))
    .toHaveValue('Rogers (1957): condiciones de la relación de ayuda.');
  await page.keyboard.press('Escape');

  // El enunciado de la escena de inicio.
  await page.getByRole('button', { name: 'Editar nodo' }).click();
  const start = page.getByRole('dialog', { name: 'Editar nodo' });
  await start.getByLabel('Enunciado de la decisión').fill('¿Cómo recibes a la persona?');
  await start.getByRole('button', { name: 'Guardar nodo' }).click();
  await expect.poll(() => nodeField(request, seed, 'inicio', 'decisionPrompt'), { timeout: scaled(15_000) }).toBe('¿Cómo recibes a la persona?');

  // La conclusión tiene su propio texto: el campo lo dice, y una escena corriente al marcarla terminal lo adopta.
  await page.getByRole('button', { name: /^cierre / }).click();
  await page.getByRole('button', { name: 'Editar nodo' }).click();
  const closing = page.getByRole('dialog', { name: 'Editar nodo' });
  await expect(closing.getByLabel('Texto de la conclusión')).toHaveValue('Fin.');
  await expect(closing.getByText('Cada conclusión tiene su propio texto.')).toBeVisible();
  await closing.getByLabel('Texto de la conclusión').fill('Ella agradece la escucha y acepta una cita de seguimiento.');
  await closing.getByRole('button', { name: 'Guardar nodo' }).click();
  // El aviso del guardado anterior puede seguir en pantalla: se espera al dato en el servidor, no al aviso.
  await expect.poll(() => nodeField(request, seed, 'cierre', 'narrative'), { timeout: scaled(15_000) })
    .toBe('Ella agradece la escucha y acepta una cita de seguimiento.');

  await page.getByRole('button', { name: /^consulta / }).click();
  await page.getByRole('button', { name: 'Editar nodo' }).click();
  const scene = page.getByRole('dialog', { name: 'Editar nodo' });
  await expect(scene.getByLabel('Narrativa')).toBeVisible();
  await scene.getByRole('checkbox', { name: 'Nodo terminal' }).check();
  await expect(scene.getByLabel('Texto de la conclusión')).toBeVisible();
  await expect(scene.getByLabel('Narrativa')).toHaveCount(0);
});

// req: RF-08, RF-09, CU-04, WCAG-2.5.7
test('las escenas se reordenan solo con el teclado: el foco acompaña a la escena y se anuncia dónde quedó', async ({ page, request }) => {
  test.setTimeout(scaled(150_000));
  const seed = await seedDraft(request, 'Orden e2e');
  await openEditor(page, seed);
  await page.getByRole('tab', { name: 'Escenas' }).click();
  const titles = () => page.locator('.so-title').allTextContents();
  const order = async () => ((await readEditor(request, seed.token, seed.id))['nodes'] as Json[])
    .sort((a, b) => a['displayOrder'] - b['displayOrder'] || a['id'] - b['id']).map(node => node['title']);
  expect(await titles()).toEqual(['Inicio del caso', 'Consulta', 'Cierre del caso']);

  const down = page.getByRole('button', { name: 'Bajar «Inicio del caso»' });
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Orden de las escenas actualizado.').first()).toBeVisible({ timeout: scaled(15_000) });
  await expect.poll(titles).toEqual(['Consulta', 'Inicio del caso', 'Cierre del caso']);
  // El navegador suelta el foco de un renglón que cambia de lugar: vuelve al mismo botón de la misma escena.
  await expect(down).toBeFocused();
  await expect(page.locator('[data-live-region="polite"]')).toContainText('«Inicio del caso» ahora es la escena 2 de 3.');

  // Otra vez con el teclado, sin volver a buscar el botón: llega al final y el botón dice por qué ya no baja.
  await page.keyboard.press('Enter');
  await expect.poll(titles).toEqual(['Consulta', 'Cierre del caso', 'Inicio del caso']);
  await expect(down).toBeFocused();
  await expect(down).toHaveAttribute('aria-disabled', 'true');
  await expect(down).toHaveAccessibleDescription('Ya es la última escena.');
  const reorders: string[] = [];
  page.on('request', req => { if (req.method() === 'PATCH' && req.url().endsWith('/nodes/reorder')) reorders.push(req.url()); });
  await page.keyboard.press('Enter');
  // Un movimiento que sí se hiciera pediría el orden y repintaría la lista unos instantes después de la pulsación.
  await page.waitForTimeout(scaled(700));
  expect(reorders, 'el botón bloqueado no pide ningún orden').toEqual([]);
  expect(await titles()).toEqual(['Consulta', 'Cierre del caso', 'Inicio del caso']);

  const up = page.getByRole('button', { name: 'Subir «Inicio del caso»' });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect.poll(titles).toEqual(['Consulta', 'Inicio del caso', 'Cierre del caso']);
  await expect(up).toBeFocused();
  expect(await order()).toEqual(['Consulta', 'Inicio del caso', 'Cierre del caso']);

  // Reordenar no cambia el grafo: la decisión sigue yendo de «Inicio del caso» a «Consulta».
  const view = await readEditor(request, seed.token, seed.id);
  expect((view['decisions'] as Json[]).map(item => [item['sourceKey'], item['targetKey']])).toEqual([['inicio', 'consulta']]);
});

// req: RF-07, RF-16, CU-04
test('la docente escribe la ficha del caso y administra sus personajes', async ({ page, request }) => {
  test.setTimeout(scaled(150_000));
  const seed = await seedDraft(request, 'Ficha e2e');
  await openEditor(page, seed);
  await page.getByRole('tab', { name: 'Ficha' }).click();

  // Contexto y objetivos: un objetivo de más de 280 caracteres lo dice y no envía nada.
  await page.getByLabel('Objetivos de aprendizaje').fill(`${'a'.repeat(281)}\nOtro.`);
  await page.getByRole('button', { name: 'Guardar ficha' }).click();
  await expect(page.getByText('Cada objetivo admite hasta 280 caracteres.')).toBeVisible();
  await expect(page.getByLabel('Objetivos de aprendizaje')).toBeFocused();

  await page.getByLabel('Contexto del caso').fill('Una mujer de 34 años llega a urgencias tras una discusión.');
  await page.getByLabel('Objetivos de aprendizaje').fill('Identificar señales de riesgo.\nValidar sin juzgar.\n\nNombrar la emoción.');
  await page.getByRole('button', { name: 'Guardar ficha' }).click();
  await expect(toast(page, 'Ficha del caso guardada.')).toBeVisible({ timeout: scaled(15_000) });
  let view = await readEditor(request, seed.token, seed.id);
  expect(view['context']).toBe('Una mujer de 34 años llega a urgencias tras una discusión.');
  expect(view['learningObjectives']).toEqual(['Identificar señales de riesgo.', 'Validar sin juzgar.', 'Nombrar la emoción.']);

  // Personajes: agregar uno que se descubre jugando, editarlo para ponerlo en la ficha y quitarlo.
  await expect(page.locator('.cb-character__name')).toHaveText(['Marta']);
  await page.getByRole('button', { name: 'Agregar personaje' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo personaje' });
  await expect(sheet.getByLabel('Clave del personaje')).toBeFocused();
  await sheet.getByRole('button', { name: 'Guardar personaje' }).click();
  await expect(sheet.getByText('Escribe la clave del personaje.')).toBeVisible();
  await expect(sheet.getByText('Escribe el nombre del personaje.')).toBeVisible();
  await sheet.getByLabel('Clave del personaje').fill('hombre-pasillo');
  await sheet.getByLabel('Nombre').fill('Hombre del pasillo');
  await sheet.getByRole('checkbox', { name: 'Aparece en la ficha del caso' }).uncheck();
  await sheet.getByRole('button', { name: 'Guardar personaje' }).click();
  await expect(toast(page, 'Personaje guardado.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.cb-character__name')).toHaveText(['Marta', 'Hombre del pasillo']);
  await expect(page.locator('.cb-character ui-badge')).toHaveText(['En la ficha', 'Se descubre jugando']);
  view = await readEditor(request, seed.token, seed.id);
  expect((view['characters'] as Json[]).map(item => [item['key'], item['showInBrief']])).toEqual([['marta', true], ['hombre-pasillo', false]]);

  await page.getByRole('button', { name: 'Editar a «Hombre del pasillo»' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar personaje' });
  await edit.getByLabel('Rol').fill('Acompañante');
  await edit.getByRole('checkbox', { name: 'Aparece en la ficha del caso' }).check();
  await edit.getByRole('button', { name: 'Guardar personaje' }).click();
  await expect(page.locator('.cb-character ui-badge')).toHaveText(['En la ficha', 'En la ficha']);
  await expect(page.locator('.cb-character__meta').last()).toHaveText('Acompañante');

  await page.getByRole('button', { name: 'Eliminar a «Hombre del pasillo»' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Eliminar personaje' });
  await expect(confirm).toContainText('quedan sin personaje');
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(toast(page, 'Personaje eliminado.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.cb-character__name')).toHaveText(['Marta']);
  view = await readEditor(request, seed.token, seed.id);
  expect((view['characters'] as Json[]).map(item => item['key'])).toEqual(['marta']);
});

// req: RNF-03, RNF-04, WCAG-2.5.7
for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`las pestañas nuevas y sus hojas no tienen hallazgos serios ni desborde en ${viewport.width}×${viewport.height}`, async ({ page, request }) => {
    test.setTimeout(scaled(180_000));
    const seed = await seedDraft(request, 'Calidad e2e', { hints: ['Mira cómo respira.', 'Pregunta por el sueño.'] });
    await page.setViewportSize(viewport);
    await openEditor(page, seed);

    for (const name of ['Escenas', 'Ayudas', 'Ficha']) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name, selected: true })).toBeVisible();
      await assertQualityState(page, test.info(), `pestaña ${name} (${viewport.width})`);
    }

    // Cada hoja nueva, abierta: sin hallazgos serios de Axe dentro de la hoja.
    const sheets: Array<{ open: () => Promise<void>; dialog: string }> = [
      { dialog: 'Nueva ayuda', open: async () => { await page.getByRole('tab', { name: 'Ayudas' }).click(); await page.getByRole('button', { name: 'Agregar ayuda a «Escena inicial»' }).click(); } },
      { dialog: 'Nuevo personaje', open: async () => { await page.getByRole('tab', { name: 'Ficha' }).click(); await page.getByRole('button', { name: 'Agregar personaje' }).click(); } },
      { dialog: 'Editar decisión', open: async () => { await page.getByRole('tab', { name: 'Grafo DAG' }).click(); await page.getByRole('button', { name: /^inicio / }).click(); await page.getByRole('button', { name: 'Editar decisión: Escuchar con atención' }).click(); } },
      { dialog: 'Editar nodo', open: async () => { await page.getByRole('tab', { name: 'Escenas' }).click(); await page.getByRole('button', { name: 'Editar «Cierre del caso»' }).click(); } },
    ];
    for (const { open, dialog } of sheets) {
      await open();
      const sheet = page.getByRole('dialog', { name: dialog });
      await expect(sheet).toBeVisible();
      expect(await blockingViolations(page, '.cdk-dialog-container'), `${dialog} (${viewport.width})`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });
}
