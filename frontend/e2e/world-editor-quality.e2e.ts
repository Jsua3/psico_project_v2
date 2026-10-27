import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Calidad del editor de mundo y de la vista previa (plan visual F8, pasada de revisión), contra el servidor REAL:
 * Axe sin nada serio con el inspector COMPLETO a la vista (un NPC con diálogo, opciones y ruta, una puerta y una
 * zona: la sonda anterior solo veía un objeto sin diálogo y no alcanzaba los botones de icono sin nombre) y la
 * versión publicada abierta en solo lectura (aviso, herramientas de edición apagadas y ningún guardado).
 */
type Json = Record<string, any>;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/login', { data: ADMIN });
  expect(response.status(), 'login por API').toBe(200);
  return (await response.json()).data.token;
}

/** Lo que Axe cuenta como bloqueante (serious y critical) en una zona de la pantalla. */
async function blocking(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} [${violation.impact}] · ${node.target.join(' ')}`));
}

/** Todo lo que Axe ve (también moderate y minor): para que la lista de «menores» no se quede sin mirar. */
async function allViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id} [${violation.impact}] · ${node.target.join(' ')}`));
}

function npc(): Json {
  return {
    key: 'npc-enfermera', label: 'Enfermera', type: 'PERSON', x: 160, y: 160, width: 48, height: 48, zIndex: 0,
    facing: 'down', colorHex: '#4FA3A5', icon: 'psychology', shortCode: 'ENF', collision: false, visible: true,
    interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {},
    movementPattern: { type: 'patrol', points: [[160, 160], [320, 160]] }, metadata: {},
  };
}

function door(): Json {
  return {
    key: 'puerta-salida', label: 'Puerta', type: 'EXIT', x: 480, y: 96, width: 48, height: 48, zIndex: 0,
    facing: 'down', colorHex: '#A85064', icon: 'door_open', shortCode: 'PUE', collision: false, visible: true,
    interactionPrompt: 'Salir', interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {},
    movementPattern: {}, metadata: {},
  };
}

// req: RNF-04, BLOQUE-H, WCAG 4.1.2
test.describe('@lienzo calidad · Axe', () => {
  test('Mundo con el inspector completo y Vista previa no tienen nada serio ni crítico, y el orden de encabezados es válido', async ({ page, request }) => {
    test.setTimeout(scaled(150_000));
    const token = await adminToken(request);
    const created = await request.post('/api/authoring/cases', {
      headers: bearer(token), data: { title: `Axe del editor ${Date.now()}` },
    });
    expect(created.status(), 'crear el caso').toBe(200);
    const view = (await created.json()).data;
    const id: number = view.caseVersionId;
    const nodeId: number = view.nodes[0].id;

    // Contenido rico por API: un NPC con ruta, diálogo con líneas y una opción, una puerta y una zona.
    const current = (await (await request.get(`/api/authoring/cases/${id}/world-editor?nodeId=${nodeId}`, { headers: bearer(token) })).json()).data;
    const saved = await request.put(`/api/authoring/cases/${id}/world?nodeId=${nodeId}`, {
      headers: bearer(token),
      data: {
        revision: current['revision'],
        map: current['map'],
        objects: [npc(), door()],
        collisionZones: [{ key: 'zona-mesa', label: 'Mesa', x: 224, y: 224, width: 96, height: 64 }],
        dialogues: [{
          key: 'dialogo-enfermera', mapObjectKey: 'npc-enfermera', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
          lines: [{ order: 1, speakerName: 'Enfermera', text: 'Buenas tardes.', emotion: 'neutral' }],
          choices: [{ key: 'saludar', text: 'Saludar', decisionOptionId: null, requiredToolCode: null, effect: {}, displayOrder: 1 }],
        }],
        clinicalTools: [],
      },
    });
    expect(saved.status(), 'guardar el mundo de prueba').toBe(200);

    await loginAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/portal/casos/${id}/editor-anterior`);
    await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });
    await page.getByRole('tab', { name: 'Mundo' }).click();
    await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).click();
    await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

    // Con el NPC seleccionado se ven NPC, diálogo, opciones y movimiento con la ruta: todos los botones de icono.
    await page.locator('.we-konva-host').focus();
    await page.keyboard.press('PageDown');
    await expect(page.getByRole('heading', { name: /^Objeto: Enfermera/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar línea' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quitar el punto 1' })).toBeVisible();
    // El inspector mide 300 px: nada se sale por la derecha de su tarjeta (rejillas `auto` lo hacían crecer).
    const overflow = await page.locator('.we-inspector').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow, 'el inspector no se desborda en horizontal').toBeLessThanOrEqual(0);
    expect(await allViolations(page, 'app-world-editor'), 'Mundo con el NPC seleccionado').toEqual([]);

    // Con la puerta seleccionada.
    await page.keyboard.press('PageDown');
    await expect(page.getByRole('heading', { name: /^Objeto: Puerta/ })).toBeVisible();
    expect(await blocking(page, 'app-world-editor'), 'Mundo con la puerta seleccionada').toEqual([]);

    // Con la zona seleccionada.
    await page.keyboard.press('PageDown');
    await expect(page.getByRole('heading', { name: /^Zona: Mesa/ })).toBeVisible();
    expect(await blocking(page, 'app-world-editor'), 'Mundo con la zona seleccionada').toEqual([]);

    // Vista previa.
    await page.getByRole('tab', { name: 'Vista previa' }).click();
    await expect(page.locator('app-world-preview [data-world-ready="true"]')).toHaveCount(1, { timeout: scaled(30_000) });
    expect(await allViolations(page, 'app-world-preview'), 'Vista previa').toEqual([]);
  });
});

// req: RNF-08
test.describe('@lienzo calidad · solo lectura', () => {
  test('una versión publicada abre el mundo en solo lectura: aviso, herramientas de edición apagadas y nada se guarda', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const token = await adminToken(request);
    const list: Json[] = (await (await request.get('/api/authoring/cases', { headers: bearer(token) })).json()).data;
    const published = list.find(item => item['status'] === 'PUBLISHED');
    test.skip(!published, 'La base de pruebas no trae una versión publicada.');

    const writes: string[] = [];
    page.on('request', r => {
      if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/api/authoring/')) writes.push(`${r.method()} ${r.url()}`);
    });

    await loginAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/portal/casos/${published!['caseVersionId']}/editor-anterior`);
    await expect(page.getByRole('heading', { level: 1, name: published!['title'] })).toBeVisible({ timeout: scaled(30_000) });
    await page.getByRole('tab', { name: 'Mundo' }).click();
    // El primer nodo de la versión publicada, por su «Título (clave)».
    const detail = (await (await request.get(`/api/authoring/cases/${published!['caseVersionId']}/editor`, { headers: bearer(token) })).json()).data;
    const first: Json = detail['nodes'][0];
    const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('button', { name: new RegExp(`${escaped(first['title'])}\\s+\\(${escaped(first['key'])}\\)`) }).click();
    await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

    await expect(page.locator('p.we-readonly')).toContainText('no se puede modificar');
    for (const name of ['Colocar objeto', 'Zona de colisión', 'Punto de aparición', 'Deshacer', 'Rehacer', 'Guardar']) {
      await expect(page.getByRole('button', { name, exact: true }), name).toBeDisabled();
    }

    // Se puede recorrer y seleccionar, pero editar no hace nada: ni Supr, ni flechas con algo seleccionado, ni Ctrl+S.
    await page.locator('.we-konva-host').focus();
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2200); // más que la espera del autoguardado (1,5 s)
    await expect(page.locator('.we-badge--dirty')).toHaveCount(0);
    expect(writes, 'no se manda ningún guardado').toEqual([]);
    // El inspector se ve pero ninguno de sus controles se puede usar.
    await expect(page.locator('.we-fieldset input:enabled, .we-fieldset select:enabled, .we-fieldset button:enabled')).toHaveCount(0);
  });
});
