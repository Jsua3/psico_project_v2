import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { send } from './support/case-fixtures';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Conflicto de revisión al guardar el MUNDO (plan visual F8-5; RNF-08, REGLA-011), contra el servidor real: otra
 * persona guarda el caso mientras la docente edita la sala, el autoguardado recibe el 409 `REVISION_CONFLICT` del
 * `PUT .../world`, el editor abre la comparación y no pierde lo escrito.
 */
type Json = Record<string, any>;

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};
const PROFESOR = {
  email: process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co',
  password: process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!',
};

const NODE_BODY = {
  requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false,
  warningMessage: null, terminal: false, startNode: false, positionX: null, positionY: null,
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function apiToken(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const response = await request.post('/api/auth/login', { data: who });
  expect(response.status(), `login de ${who.email} por API`).toBe(200);
  return (await response.json()).data.token;
}

async function readWorld(request: APIRequestContext, token: string, caseVersionId: number, nodeId: number): Promise<Json> {
  const response = await request.get(`/api/authoring/cases/${caseVersionId}/world-editor?nodeId=${nodeId}`, {
    headers: bearer(token),
  });
  expect(response.status(), 'GET world-editor').toBe(200);
  return (await response.json()).data;
}

/** Abre «Mundo» en el nodo «inicio» y espera a que exista el panel de la sala. */
async function openWorld(page: import('@playwright/test').Page, id: number, title: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/portal/casos/${id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Mundo' }).click();
  await page.getByRole('button', { name: /Inicio del caso\s+\(inicio\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });
}

// req: RNF-08, REGLA-011
test.describe('@lienzo conflicto de revisión', () => {
  test('si otra persona guardó el caso, el autoguardado del mundo abre la comparación y «Reintentar con mi cambio» conserva lo escrito', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const professorToken = await apiToken(request, PROFESOR);
    // Por el ayudante compartido: de paso la suite aprende la revisión del caso, que la edición ajena tiene que mandar.
    const view = await send(request, professorToken, 'post', '/api/authoring/cases', {
      title: `Conflicto del mundo e2e ${Date.now()}`,
    }, 'crear el caso');
    const id: number = view.caseVersionId;
    const nodeId: number = view.nodes[0].id;

    await loginAs(page, 'profesor');
    await openWorld(page, id, view.title);

    // Otra persona (la administradora) guarda el caso entre medias: la revisión de la pantalla queda vencida.
    const adminToken = await apiToken(request, ADMIN);
    await send(request, adminToken, 'post', `/api/authoring/cases/${id}/nodes`, {
      ...NODE_BODY, nodeKey: 'ajeno', title: 'Nodo ajeno', narrative: 'Lo agregó otra sesión.',
    }, 'edición de la otra persona');

    // La docente agrega un objeto: el autoguardado manda la revisión vencida y el servidor responde 409.
    const rejected = page.waitForResponse(
      r => r.request().method() === 'PUT' && r.url().includes(`/api/authoring/cases/${id}/world`),
      { timeout: scaled(30_000) },
    );
    await page.locator('.we-template-btn').first().click();
    expect((await rejected).status(), 'PUT world con la revisión vencida').toBe(409);

    const conflict = page.getByRole('dialog', { name: 'Este caso cambió en otra sesión' });
    await expect(conflict).toBeVisible();
    // Nada se guardó todavía, y lo escrito sigue en pantalla.
    expect((await readWorld(request, professorToken, id, nodeId))['objects']).toHaveLength(0);
    await expect(page.locator('.we-info')).toContainText('1 objetos');

    const retried = page.waitForResponse(
      r => r.request().method() === 'PUT' && r.url().includes(`/api/authoring/cases/${id}/world`),
      { timeout: scaled(30_000) },
    );
    await conflict.getByRole('button', { name: 'Reintentar con mi cambio' }).click();
    expect((await retried).status(), 'PUT world con la revisión vigente').toBe(200);

    await expect(conflict).toHaveCount(0);
    await expect(page.locator('.we-badge--dirty')).toHaveCount(0, { timeout: scaled(15_000) });
    expect((await readWorld(request, professorToken, id, nodeId))['objects']).toHaveLength(1);
    const editor = await request.get(`/api/authoring/cases/${id}/editor`, { headers: bearer(professorToken) });
    const keys = (await editor.json()).data.nodes.map((node: Json) => node['key']);
    expect(keys, 'lo de la otra persona sigue ahí').toContain('ajeno');
  });
});
