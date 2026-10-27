import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Lienzo del editor de mundo (plan visual F8-4; KON-4, KON-5, KON-7), contra el servidor REAL: cursor por herramienta y
 * por lo que hay bajo el puntero, zonas arrastradas y con tamaño cambiado que SE GUARDAN, zoom hacia el cursor y
 * paneo. Konva no corre en jsdom: lo que se ve en el lienzo se comprueba por su cursor y por lo que quedó en el
 * servidor, nunca por pixeles.
 */
type Json = Record<string, any>;

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};

async function apiToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/login', { data: ADMIN });
  expect(response.status(), 'login por API').toBe(200);
  return (await response.json()).data.token;
}

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

interface Canvas {
  box: { x: number; y: number; width: number; height: number };
  cursor: () => Promise<string>;
  at: (worldX: number, worldY: number) => { x: number; y: number };
}

async function openCanvas(page: Page, request: APIRequestContext): Promise<{ id: number; nodeId: number; token: string; canvas: Canvas }> {
  const token = await apiToken(request);
  const created = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Lienzo e2e ${Date.now()}` },
  });
  expect(created.status(), 'crear el caso').toBe(200);
  const view = (await created.json()).data;
  const id: number = view.caseVersionId;
  const nodeId: number = view.nodes[0].id;

  await loginAs(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/portal/casos/${id}/editor-anterior`);
  await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Mundo' }).click();
  const loaded = page.waitForResponse(
    r => r.request().method() === 'GET' && r.url().includes(`/api/authoring/cases/${id}/world-editor`),
    { timeout: scaled(30_000) },
  );
  await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).click();
  await loaded;
  await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });

  const canvasElement = page.locator('.we-konva-host canvas').first();
  await canvasElement.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
  const box = (await canvasElement.boundingBox())!;
  expect(box, 'el lienzo está en pantalla').not.toBeNull();
  const host = page.locator('.we-konva-host');
  return {
    id, nodeId, token,
    canvas: {
      box,
      cursor: () => host.evaluate(element => getComputedStyle(element).cursor),
      at: (worldX, worldY) => ({ x: box.x + worldX, y: box.y + worldY }),
    },
  };
}

const tool = (page: Page, name: RegExp) => page.getByRole('button', { name });

/**
 * Elige «Seleccionar» y espera a que el lienzo se repinte con esa herramienta: el cursor sobre el vacío vuelve a ser la
 * flecha. Un clic justo después caería entre el repintado y borraría el nodo bajo el puntero.
 */
async function selectTool(page: Page, canvas: Canvas): Promise<void> {
  await tool(page, /seleccionar/i).click();
  const empty = canvas.at(700, 450);
  await page.mouse.move(empty.x, empty.y);
  await expect.poll(() => canvas.cursor()).toBe('default');
}

// req: RNF-04, KON-4
test.describe('@lienzo cursor', () => {
  test('cada herramienta pone su cursor y, con «Seleccionar», lo que hay bajo el puntero lo cambia', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const { id, nodeId, token, canvas } = await openCanvas(page, request);
    const empty = canvas.at(700, 400);

    await page.mouse.move(empty.x, empty.y);
    expect(await canvas.cursor(), 'seleccionar, sobre el vacío').toBe('default');

    await tool(page, /zona de colisi[oó]n/i).click();
    await page.mouse.move(empty.x + 4, empty.y + 4);
    expect(await canvas.cursor(), 'zona de colisión').toBe('crosshair');

    await tool(page, /colocar objeto/i).click();
    await page.mouse.move(empty.x, empty.y);
    expect(await canvas.cursor(), 'colocar objeto').toBe('crosshair');

    await tool(page, /mover lienzo/i).click();
    await page.mouse.move(empty.x + 4, empty.y + 4);
    expect(await canvas.cursor(), 'mover lienzo').toBe('grab');

    // Un objeto bajo el puntero, con «Seleccionar»: cursor de mover.
    await tool(page, /seleccionar/i).click();
    await autosaved(page, id, async () => { await page.locator('.we-template-btn').first().click(); });
    const object = (await readWorld(request, token, id, nodeId))['objects'][0];
    const over = canvas.at(object['x'], object['y']);
    await page.mouse.move(over.x, over.y);
    expect(await canvas.cursor(), 'sobre un objeto').toBe('move');
    await page.mouse.move(empty.x, empty.y);
    expect(await canvas.cursor(), 'de vuelta al vacío').toBe('default');
  });
});

// req: RNF-04, KON-7
test.describe('@lienzo zonas', () => {
  test('una zona arrastrada con el ratón se guarda en su sitio nuevo (antes volvía al origen)', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const { id, nodeId, token, canvas } = await openCanvas(page, request);

    await tool(page, /zona de colisi[oó]n/i).click();
    const from = canvas.at(160, 128);
    const to = canvas.at(288, 208);
    await autosaved(page, id, async () => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
    });
    const zone = (await readWorld(request, token, id, nodeId))['collisionZones'][0];
    expect([zone['x'], zone['y'], zone['width'], zone['height']]).toEqual([160, 128, 128, 80]);

    await selectTool(page, canvas);
    const grab = canvas.at(zone['x'] + zone['width'] / 2, zone['y'] + zone['height'] / 2);
    await autosaved(page, id, async () => {
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + 64, grab.y + 32, { steps: 8 });
      await page.mouse.up();
    });

    const moved = (await readWorld(request, token, id, nodeId))['collisionZones'][0];
    expect([moved['x'], moved['y'], moved['width'], moved['height']]).toEqual([224, 160, 128, 80]);
  });

  test('una zona seleccionada se redimensiona con las asas y el tamaño nuevo se guarda', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const { id, nodeId, token, canvas } = await openCanvas(page, request);

    await tool(page, /zona de colisi[oó]n/i).click();
    const from = canvas.at(160, 128);
    const to = canvas.at(288, 208);
    await autosaved(page, id, async () => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
    });
    await selectTool(page, canvas);
    const centre = canvas.at(224, 168);
    await page.mouse.click(centre.x, centre.y);
    await expect(page.getByRole('heading', { name: /^Zona:/ })).toBeVisible();

    // El asa de la esquina inferior derecha está en (x + ancho, y + alto) = (288, 208).
    const handle = canvas.at(288, 208);
    await autosaved(page, id, async () => {
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x + 48, handle.y + 32, { steps: 8 });
      await page.mouse.up();
    });

    const zone = (await readWorld(request, token, id, nodeId))['collisionZones'][0];
    expect([zone['x'], zone['y'], zone['width'], zone['height']]).toEqual([160, 128, 176, 112]);
  });
});

// req: RNF-04, KON-5
test.describe('@lienzo zoom y paneo', () => {
  test('el zoom con la rueda es hacia el cursor y «Mover lienzo» desplaza el mundo', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const { id, nodeId, token, canvas } = await openCanvas(page, request);
    await autosaved(page, id, async () => { await page.locator('.we-template-btn').first().click(); });
    const object = (await readWorld(request, token, id, nodeId))['objects'][0];
    const over = canvas.at(object['x'], object['y']);

    // Zoom con la rueda justo sobre el objeto: sigue bajo el cursor.
    await page.mouse.move(over.x, over.y);
    const before = await page.locator('.we-zoom-label').innerText();
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.locator('.we-zoom-label').innerText()).not.toBe(before);
    await page.mouse.move(over.x + 1, over.y + 1);
    expect(await canvas.cursor(), 'el objeto sigue bajo el cursor tras acercar').toBe('move');

    // Paneo: con «Mover lienzo» se arrastra 160 px a la derecha; el objeto deja de estar en su sitio.
    await tool(page, /mover lienzo/i).click();
    await page.mouse.move(over.x, over.y + 100);
    await page.mouse.down();
    await page.mouse.move(over.x + 160, over.y + 100, { steps: 8 });
    await page.mouse.up();
    await tool(page, /seleccionar/i).click();
    await page.mouse.move(over.x + 1, over.y + 1);
    expect(await canvas.cursor(), 'el objeto ya no está donde estaba').toBe('default');
    await page.mouse.move(over.x + 161, over.y + 1);
    expect(await canvas.cursor(), 'el objeto se movió con el lienzo').toBe('move');
  });
});
