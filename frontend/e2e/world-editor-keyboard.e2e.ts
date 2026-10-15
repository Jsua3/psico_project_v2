import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Editor de mundo SOLO con teclado (plan visual F8-5; RNF-04, WCAG 2.1.1 y 2.1.4), contra el servidor REAL: llegar al
 * lienzo con flechas y Tab, colocar un objeto, moverlo con flechas (una casilla; Mayús, ocho), borrarlo, dibujar una
 * zona con dos pulsaciones y guardar con Ctrl+S sin esperar el autoguardado. Después del acceso no se toca el ratón.
 */
type Json = Record<string, any>;

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};

const GRID = 16;
const snap = (value: number) => Math.round(value / GRID) * GRID;

async function readWorld(request: APIRequestContext, token: string, caseVersionId: number, nodeId: number): Promise<Json> {
  const response = await request.get(`/api/authoring/cases/${caseVersionId}/world-editor?nodeId=${nodeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status(), 'GET world-editor').toBe(200);
  return (await response.json()).data;
}

/** Ejecuta `action` y espera a que el autoguardado (PUT .../world) responda y el editor quede sin cambios. */
async function autosaved(page: Page, caseVersionId: number, action: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse(
    r => r.request().method() === 'PUT' && r.url().includes(`/api/authoring/cases/${caseVersionId}/world`),
    { timeout: scaled(30_000) },
  );
  await action();
  expect((await response).status(), 'PUT world').toBe(200);
  await expect(page.locator('.we-badge--dirty')).toHaveCount(0, { timeout: scaled(15_000) });
}

// req: RNF-04, WCAG 2.1.1, WCAG 2.1.4
test('el editor de mundo se maneja solo con teclado: colocar, mover, borrar, dibujar una zona y guardar con Ctrl+S', async ({ page, request }) => {
  test.setTimeout(scaled(150_000));
  const login = await request.post('/api/auth/login', { data: ADMIN });
  const token: string = (await login.json()).data.token;
  const created = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Teclado e2e ${Date.now()}` },
  });
  const view = (await created.json()).data;
  const id: number = view.caseVersionId;
  const nodeId: number = view.nodes[0].id;
  const spawn = (await readWorld(request, token, id, nodeId))['map'];
  const origin = { x: snap(spawn['spawnX']), y: snap(spawn['spawnY']) };

  await loginAs(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/portal/casos/${id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });

  // ── Llegar al editor de mundo: pestañas con flechas y el selector de sala con Intro ───────────────────────────
  await page.getByRole('tab', { name: 'Grafo DAG' }).focus();
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mundo', selected: true })).toBeVisible();
  const loaded = page.waitForResponse(
    r => r.request().method() === 'GET' && r.url().includes(`/api/authoring/cases/${id}/world-editor`),
    { timeout: scaled(30_000) },
  );
  await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).focus();
  await page.keyboard.press('Enter');
  await loaded;
  await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

  const canvas = page.locator('.we-konva-host');
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const status = page.locator('.we-root p[role="status"]');

  // ── Colocar un objeto: O, mover el cursor con flechas (Mayús = 8 casillas) e Intro ────────────────────────────
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Colocar objeto' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const placeAt = { x: origin.x + 8 * GRID, y: origin.y + 2 * GRID };
  await autosaved(page, id, async () => { await page.keyboard.press('Enter'); });
  let world = await readWorld(request, token, id, nodeId);
  expect(world['objects']).toHaveLength(1);
  expect([world['objects'][0]['x'], world['objects'][0]['y']]).toEqual([placeAt.x, placeAt.y]);
  await expect(page.getByRole('button', { name: 'Seleccionar' })).toHaveAttribute('aria-pressed', 'true');

  // ── Mover lo seleccionado: dos casillas a la izquierda ───────────────────────────────────────────────────────
  await autosaved(page, id, async () => {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
  });
  world = await readWorld(request, token, id, nodeId);
  expect([world['objects'][0]['x'], world['objects'][0]['y']]).toEqual([placeAt.x - 2 * GRID, placeAt.y]);

  // ── Borrar con Supr ──────────────────────────────────────────────────────────────────────────────────────────
  await autosaved(page, id, async () => { await page.keyboard.press('Delete'); });
  world = await readWorld(request, token, id, nodeId);
  expect(world['objects']).toHaveLength(0);

  // ── Zona de colisión con dos pulsaciones de Intro y guardado inmediato con Ctrl+S ────────────────────────────
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Zona de colisión' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter'); // primera esquina, donde está el cursor
  await page.keyboard.press('Shift+ArrowRight');
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // segunda esquina: la zona se crea
  await expect(page.getByText('1 zonas')).toBeVisible();

  const flushed = page.waitForResponse(
    r => r.request().method() === 'PUT' && r.url().includes(`/api/authoring/cases/${id}/world`),
    // El autoguardado espera 1,5 s: una respuesta antes prueba que Ctrl+S guardó al instante.
    { timeout: 1_200 },
  );
  await page.keyboard.press('Control+s');
  expect((await flushed).status(), 'Ctrl+S').toBe(200);
  await expect(status).toHaveText('Guardado');

  world = await readWorld(request, token, id, nodeId);
  expect(world['collisionZones']).toHaveLength(1);
  expect([world['collisionZones'][0]['width'], world['collisionZones'][0]['height']]).toEqual([8 * GRID, 4 * GRID]);

  // Los atajos de una letra no actúan fuera del lienzo: «c» escrito en la etiqueta de la zona no cambia de herramienta.
  await page.getByRole('button', { name: 'Seleccionar' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Seleccionar' })).toHaveAttribute('aria-pressed', 'true');
});

// req: RNF-04, WCAG 2.1.4
test('los atajos de una letra no secuestran la página: fuera del lienzo no cambian de herramienta', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const login = await request.post('/api/auth/login', { data: ADMIN });
  const token: string = (await login.json()).data.token;
  const created = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Atajos e2e ${Date.now()}` },
  });
  const view = (await created.json()).data;
  await loginAs(page, 'admin');
  await page.goto(`/portal/casos/${view.caseVersionId}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Mundo' }).click();
  await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

  // Con el foco en el título de la página (fuera del lienzo), «c», «o» y «h» no hacen nada.
  await page.getByRole('heading', { level: 1 }).evaluate(element => (element as HTMLElement).setAttribute('tabindex', '-1'));
  await page.getByRole('heading', { level: 1 }).focus();
  await page.keyboard.press('c');
  await page.keyboard.press('o');
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Seleccionar' })).toHaveAttribute('aria-pressed', 'true');

  // Con el foco en el lienzo sí.
  await page.locator('.we-konva-host').focus();
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Mover lienzo' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Seleccionar' })).toHaveAttribute('aria-pressed', 'true');
});

// req: RNF-04, WCAG 2.1.4
test('las letras eligen herramienta desde la barra y, tras un clic en el lienzo, el foco queda ahí: Supr borra lo seleccionado', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const login = await request.post('/api/auth/login', { data: ADMIN });
  const token: string = (await login.json()).data.token;
  const created = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Foco e2e ${Date.now()}` },
  });
  const view = (await created.json()).data;
  const id: number = view.caseVersionId;
  const nodeId: number = view.nodes[0].id;
  await loginAs(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/portal/casos/${id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Mundo' }).click();
  await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

  // Barra de herramientas: con el foco en un botón de herramienta, la letra anunciada en aria-keyshortcuts la elige.
  const select = page.getByRole('button', { name: 'Seleccionar' });
  await select.focus();
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Colocar objeto' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(select).toHaveAttribute('aria-pressed', 'true');

  // Un objeto de la biblioteca (ratón) y un clic sobre él en el lienzo: el foco pasa al lienzo (Konva cancela el
  // mousedown y el navegador no lo mueve solo), y Supr borra lo seleccionado sin tocar ningún otro control.
  await autosaved(page, id, async () => { await page.locator('.we-template-btn').first().click(); });
  const object = (await readWorld(request, token, id, nodeId))['objects'][0];
  const canvasElement = page.locator('.we-konva-host canvas').first();
  await canvasElement.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  const box = (await canvasElement.boundingBox())!;
  expect(box, 'el lienzo está en pantalla').not.toBeNull();
  await page.mouse.click(box.x + object['x'], box.y + object['y']);
  await expect(page.locator('.we-konva-host')).toBeFocused();

  await autosaved(page, id, async () => { await page.keyboard.press('Delete'); });
  expect((await readWorld(request, token, id, nodeId))['objects']).toHaveLength(0);
});
