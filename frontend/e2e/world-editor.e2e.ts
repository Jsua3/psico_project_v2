import { test, expect, APIRequestContext, Page } from '@playwright/test';

import { scaled } from './support/time-scale';

/**
 * A-05 / A-05b — el editor de mundo guarda de verdad, en un navegador real.
 *
 * Contra Django + PostgreSQL: crea un caso nuevo, agrega objetos desde la biblioteca de autoría y
 * comprueba por API lo que quedó guardado. Fija lo que las pruebas unitarias del store no pueden:
 *
 * 1. los ids reales que da el servidor se adoptan: tres autoguardados seguidos no cambian los ids
 *    de lo ya guardado (sin A-05b cada guardado recreaba lo nuevo con otro id);
 * 2. el diálogo de un objeto nuevo apunta al id REAL de su objeto;
 * 3. borrar objeto + diálogo persiste: al recargar no reaparecen;
 * 4. un id local que coincide con el de otro caso no se lleva sus objetos (A-05).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@psychosim.edu.co';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!';

type Json = Record<string, any>;

async function apiLogin(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(response.status(), 'login del administrador por API').toBe(200);
  return (await response.json()).data.token;
}

async function readWorld(request: APIRequestContext, token: string, versionId: number, nodeId: number): Promise<Json> {
  const response = await request.get(`/api/admin/cases/${versionId}/world-editor?nodeId=${nodeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status(), 'GET world-editor').toBe(200);
  return (await response.json()).data;
}

/** Los objetos de todas las demás versiones de caso, para comprobar que nada ajeno cambia. */
async function foreignObjects(request: APIRequestContext, token: string, ownVersionId: number): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const versions: Json[] = (await (await request.get('/api/admin/cases', { headers })).json()).data;
  const rows: Json[] = [];
  for (const version of versions) {
    if (version['caseVersionId'] === ownVersionId) continue;
    const view = (await (await request.get(`/api/admin/cases/${version['caseVersionId']}/editor`, { headers })).json()).data;
    rows.push({ version: version['caseVersionId'], objects: view.objects });
  }
  return JSON.stringify(rows);
}

/**
 * Abre la pestaña «Mundo» del nodo «inicio». «0 objetos · 0 zonas» se pinta también antes de que
 * cargue la sala, así que se espera a la respuesta del servidor y a que exista el panel «Sala».
 */
async function openWorldEditor(page: Page, versionId: number): Promise<void> {
  await page.getByRole('tab', { name: 'Mundo' }).click();
  const loaded = page.waitForResponse(
    r => r.request().method() === 'GET' && r.url().includes(`/api/admin/cases/${versionId}/world-editor`),
    { timeout: scaled(30_000) },
  );
  await page.getByRole('button', { name: /inicio\s+—\s+Inicio del caso/ }).click();
  await loaded;
  await expect(page.getByRole('heading', { name: 'Sala', level: 4 })).toBeVisible({ timeout: scaled(15_000) });
}

/** Ejecuta `action` y espera a que el autoguardado (PUT .../world) responda y el editor quede sin cambios. */
async function autosaved(page: Page, versionId: number, action: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse(
    r => r.request().method() === 'PUT' && r.url().includes(`/api/admin/cases/${versionId}/world`),
    { timeout: scaled(30_000) },
  );
  await action();
  expect((await response).status(), 'PUT world').toBe(200);
  await expect(page.locator('.we-badge--dirty')).toHaveCount(0, { timeout: scaled(15_000) });
}

test('el editor de mundo conserva los ids reales entre autoguardados y persiste los borrados', async ({ page, request }) => {
  test.setTimeout(scaled(180_000));
  const token = await apiLogin(request);

  // Caso nuevo: una versión DRAFT con el nodo «inicio» y su escena vacía.
  const created = await request.post('/api/admin/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Editor e2e ${Date.now()}` },
  });
  expect(created.status(), 'crear el caso').toBe(200);
  const view = (await created.json()).data;
  const versionId: number = view.caseVersionId;
  const nodeId: number = view.nodes[0].id;
  const foreignBefore = await foreignObjects(request, token, versionId);

  await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').last().fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//, { timeout: scaled(30_000) });

  await page.goto(`/portal/casos/${versionId}/editor`);
  await openWorldEditor(page, versionId);
  await expect(page.locator('.we-info')).toContainText('0 objetos');
  const templates = page.locator('.we-template-btn');
  expect(await templates.count(), 'plantillas de objeto de la biblioteca').toBeGreaterThanOrEqual(3);

  // 1. Tres objetos nuevos, uno por autoguardado: los ya guardados NO cambian de id.
  let previous: Json[] = [];
  for (let index = 0; index < 3; index++) {
    await autosaved(page, versionId, async () => { await templates.nth(index).click(); });
    const world = await readWorld(request, token, versionId, nodeId);
    expect(world['objects'], `objetos tras el guardado ${index + 1}`).toHaveLength(index + 1);
    const idByKey = new Map<string, number>(world['objects'].map((o: Json) => [o['key'], o['id']]));
    for (const saved of previous) {
      expect(idByKey.get(saved['key']), `${saved['key']} conserva su id real en el guardado ${index + 1}`).toBe(saved['id']);
    }
    previous = world['objects'];
  }
  const ownerKey: string = previous[previous.length - 1]['key'];

  // Nada de otros casos se tocó: los ids locales del editor parten de 1 y existen en otras salas.
  expect(await foreignObjects(request, token, versionId), 'los objetos de otros casos no cambian al guardar')
    .toBe(foreignBefore);

  // 2. Diálogo sobre el objeto seleccionado (el último que se agregó).
  await autosaved(page, versionId, async () => {
    await page.getByRole('button', { name: /agregar di[aá]logo/i }).click();
  });
  const withDialogue = await readWorld(request, token, versionId, nodeId);
  const owner = withDialogue['objects'].find((o: Json) => o['key'] === ownerKey);
  expect(withDialogue['dialogues']).toHaveLength(1);
  expect(withDialogue['dialogues'][0]['mapObjectId'], 'el diálogo apunta al id REAL de su objeto').toBe(owner['id']);

  // 3. Borrar el objeto seleccionado: la macro quita también su diálogo.
  await autosaved(page, versionId, async () => { await page.keyboard.press('Delete'); });
  const afterDelete = await readWorld(request, token, versionId, nodeId);
  expect(afterDelete['objects']).toHaveLength(2);
  expect(afterDelete['objects'].some((o: Json) => o['key'] === ownerKey), 'el objeto borrado ya no está').toBe(false);
  expect(afterDelete['dialogues'], 'su diálogo tampoco').toHaveLength(0);

  // 4. Zona de colisión: se dibuja con el ratón y se guarda con su id real (el original ignoraba las zonas).
  const canvas = page.locator('.we-konva-host canvas').first();
  // El lienzo queda debajo del pliegue en 1280x720: se centra antes de medirlo y operar sobre él.
  // `instant`: el contenedor tiene desplazamiento suave y medir a mitad del movimiento da otra posición.
  const centerCanvas = async () => {
    await canvas.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    const box = await canvas.boundingBox();
    expect(box, 'el lienzo del editor está en pantalla').not.toBeNull();
    return box!;
  };
  // La herramienta se elige antes de medir: el clic de Playwright desplaza la página hasta el botón.
  await page.getByRole('button', { name: /zona de colisi[oó]n/i }).click();
  const box = await centerCanvas();
  await autosaved(page, versionId, async () => {
    await page.mouse.move(box.x + 160, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + 280, box.y + 200, { steps: 6 });
    await page.mouse.up();
  });
  const withZone = await readWorld(request, token, versionId, nodeId);
  expect(withZone['collisionZones'], 'la zona dibujada se guardó').toHaveLength(1);
  const zoneId: number = withZone['collisionZones'][0]['id'];

  // 5. Otro autoguardado (un objeto más): la zona conserva su id.
  await autosaved(page, versionId, async () => { await templates.nth(3).click(); });
  const nextWorld = await readWorld(request, token, versionId, nodeId);
  expect(nextWorld['objects']).toHaveLength(3);
  expect(nextWorld['collisionZones'].map((z: Json) => z['id']), 'la zona conserva su id real').toEqual([zoneId]);

  // 6. Recarga: lo borrado no reaparece y el editor muestra exactamente lo guardado.
  await page.reload();
  await openWorldEditor(page, versionId);
  await expect(page.locator('.we-info')).toContainText('3 objetos · 1 zonas');
  const reloaded = await readWorld(request, token, versionId, nodeId);
  expect(reloaded['objects'].map((o: Json) => o['id']).sort()).toEqual(nextWorld['objects'].map((o: Json) => o['id']).sort());
  expect(reloaded['objects'].some((o: Json) => o['key'] === ownerKey), 'el objeto borrado no reaparece').toBe(false);

  // 7. Borrar la zona (seleccionada con el ratón sobre el lienzo): el servidor la quita.
  await page.keyboard.press('v');
  const reloadedBox = await centerCanvas();
  await page.mouse.click(reloadedBox.x + 220, reloadedBox.y + 160);
  await autosaved(page, versionId, async () => {
    await page.getByRole('button', { name: /eliminar zona/i }).click();
  });
  expect((await readWorld(request, token, versionId, nodeId))['collisionZones'], 'la zona borrada ya no está').toHaveLength(0);

  // 8. Nada de otros casos se tocó al terminar.
  expect(await foreignObjects(request, token, versionId), 'los objetos de otros casos no cambian').toBe(foreignBefore);
});
