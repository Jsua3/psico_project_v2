import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { guardado, sinInfraccionesGraves } from './support/autoria-flujo';
import { bearer, buildPublishableDraft, contentReviewProof, send as sendToCase, transition } from './support/case-fixtures';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Revisión del caso en el editor nuevo (plan visual F10-6†, P6 tarea 8; RF-12, RF-13, CU-05; contratos C4 y C6), contra el
 * servidor REAL de la base desechable (sin `page.route`): qué falta para enviar con «Llévame ahí», el motivo que bloquea el
 * envío, el ciclo borrador → en revisión → borrador (con motivo y nota) → en revisión → publicado, y lo que cada rol puede hacer
 * según `allowedTransitions` del servidor. La decisión de Psicología (aprobar, devolver) vive en la misma pantalla de revisión
 * del editor, en el panel «Estado y decisión del caso».
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

async function apiToken(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const response = await request.post('/api/auth/login', { data: who });
  expect(response.status(), `login de ${who.email} por API`).toBe(200);
  return (await response.json()).data.token;
}

/** Una mutación del caso por la API real (con su revisión, como el editor); `path` cuelga de `/api/authoring/cases`. */
const send = (request: APIRequestContext, token: string, method: 'post' | 'put', path: string, data: Json, what: string) =>
  sendToCase(request, token, method, `/api/authoring/cases${path}`, data, what);

/** El aviso del sistema (los avisos también se repiten en la región viva, fuera de pantalla: un solo elemento visible). */
const toast = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);

/** Deja el caso fuera del catálogo y de las listas: lo devuelve a borrador si está en revisión y lo archiva (al administrador le basta). */
async function retire(request: APIRequestContext, caseVersionId: number): Promise<void> {
  try {
    const admin = await apiToken(request, ADMIN);
    const state = (await (await request.get(`/api/authoring/cases/${caseVersionId}/lifecycle`, { headers: bearer(admin) })).json()).data?.state;
    if (state === 'IN_REVIEW') await transition(request, admin, caseVersionId, { action: 'reject', reason: 'FORMA', note: 'Limpieza de la prueba e2e.' });
    await transition(request, admin, caseVersionId, { action: 'archive', scope: 'version' });
  } catch {
    // La limpieza nunca tapa el resultado de la prueba.
  }
}

/** Los casos que crean las pruebas sin su propio `finally`: al terminar (pasen o fallen) se retiran. */
const toRetire: number[] = [];
test.afterEach(async ({ request }) => {
  for (const id of toRetire.splice(0)) await retire(request, id);
});

/** Abre la pantalla «Enviar a revisión» del editor nuevo. */
async function openReview(page: Page, caseVersionId: number): Promise<void> {
  await page.goto(`/portal/casos/${caseVersionId}/editor/revision`);
  await expect(page.getByRole('heading', { level: 1, name: 'Enviar a revisión' })).toBeVisible({ timeout: scaled(30_000) });
}

const badge = (page: Page) => page.locator('[data-accion="decision-caso"] ui-badge').first();
const send_ = (page: Page) => page.getByRole('button', { name: 'Enviar a Psicología' });

// req: RF-12, RF-13, CU-05
test.describe('@revision-casos qué falta y estado del caso (F10-6)', () => {
  test('un borrador incompleto dice qué falta, bloquea el envío con su motivo y «Llévame ahí» lleva a lo que falta', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const token = await apiToken(request, PROFESOR);
    const created = await send(request, token, 'post', '', { title: `Revisión bloqueada e2e ${Date.now()}` }, 'crear el caso');
    toRetire.push(created['caseVersionId']);
    await loginAs(page, 'profesor');
    await openReview(page, created['caseVersionId']);

    await expect(page.locator('.pildora.estado')).toHaveText('Borrador');
    const falta = page.getByRole('heading', { name: /^Por resolver \((\d+)\)$/ });
    await expect(falta).toBeVisible({ timeout: scaled(30_000) });
    expect(Number(/\((\d+)\)/.exec(await falta.innerText())![1]), 'un caso en blanco tiene cosas por resolver').toBeGreaterThan(0);
    const enviar = send_(page);
    await expect(enviar).toHaveAttribute('aria-disabled', 'true');
    await expect(enviar).toHaveAccessibleDescription(/Resuelve|cosa/);

    // Bloqueado de verdad: pulsarlo (con `force`, Playwright no clica lo que está aria-disabled) no envía nada.
    await enviar.click({ force: true });
    await page.waitForTimeout(500);
    expect((await (await request.get(`/api/authoring/cases/${created['caseVersionId']}/lifecycle`, { headers: bearer(token) })).json()).data.state).toBe('DRAFT');

    // Cada falta se lee en lenguaje llano (nunca con el código) y «Llévame ahí» lleva a donde se resuelve.
    const faltas = page.locator('section.por-resolver li.falta');
    await expect(faltas.first()).toBeVisible();
    expect(await page.locator('section.por-resolver').innerText()).not.toMatch(/WORLD\.|DSL\.|OCL-/);
    await sinInfraccionesGraves(page, 'la revisión de un borrador incompleto');
    await faltas.first().getByRole('button', { name: /^Llévame ahí/ }).click();
    await expect(page).not.toHaveURL(/\/editor\/revision$/, { timeout: scaled(15_000) });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('el ciclo completo: enviar a revisión, devolver con motivo y nota, volver a enviar y aprobar', async ({ page, request }) => {
    test.setTimeout(scaled(240_000));
    const token = await apiToken(request, ADMIN);
    const draft = await buildPublishableDraft(request, token, { title: `Revisión e2e ${Date.now()}` });
    try {
      await loginAs(page, 'admin');
      await openReview(page, draft.id);
      // Este borrador mínimo está listo para enviar: nada por resolver.
      await expect(page.getByRole('heading', { name: 'Por resolver (0)' })).toBeVisible({ timeout: scaled(30_000) });
      await expect(send_(page)).toHaveAttribute('aria-disabled', 'false', { timeout: scaled(30_000) });

      // 1 · enviar a revisión: queda «En revisión» y solo se puede ver
      await send_(page).click();
      const decision = page.locator('[data-accion="decision-caso"]');
      await expect(decision.getByRole('heading', { name: 'Estado y decisión del caso' })).toBeVisible({ timeout: scaled(30_000) });
      await expect(badge(page)).toHaveText('En revisión', { timeout: scaled(30_000) });
      await expect(page.locator('main [role="note"].solo-lectura')).toContainText('El caso está en revisión de Psicología');
      await sinInfraccionesGraves(page, 'el caso en revisión, con la decisión a la vista');

      // 2 · devolver a borrador: el formulario incompleto dice qué falta; con motivo y nota se devuelve
      await decision.getByRole('button', { name: 'Devolver a borrador' }).click();
      const returnDialog = page.getByRole('dialog', { name: 'Devolver el caso a borrador' });
      await expect(returnDialog).toBeVisible();
      await sinInfraccionesGraves(page, 'el cuadro de devolver a borrador');
      await returnDialog.getByRole('button', { name: 'Devolver a borrador' }).click();
      await expect(returnDialog.getByText('Elige un motivo.')).toBeVisible();
      await expect(returnDialog.getByText('Escribe una nota para quien autora el caso.')).toBeVisible();
      await expect(returnDialog.getByLabel('Motivo')).toBeFocused();
      await returnDialog.getByLabel('Motivo').selectOption('FORMA');
      await returnDialog.getByLabel(/^Nota para quien autora el caso/).fill('Falta contexto en la primera escena.');
      await returnDialog.getByRole('button', { name: 'Devolver a borrador' }).click();
      await expect(toast(page, 'El caso volvió a borrador.')).toBeVisible();
      // El editor vuelve a ser editable y quien autora lee por qué se devolvió.
      await expect(page.locator('main [role="note"].solo-lectura')).toHaveCount(0, { timeout: scaled(30_000) });
      const devuelto = page.locator('[data-accion="devuelto-por-psicologia"]');
      await expect(devuelto).toBeVisible({ timeout: scaled(30_000) });
      await expect(devuelto).toContainText('Motivo: Forma.');
      await expect(devuelto).toContainText('Falta contexto en la primera escena.');
      await sinInfraccionesGraves(page, 'el caso devuelto a borrador con su motivo');

      // 3 · volver a enviar y aprobar con una nota y la constancia de la revisión de contenido
      await expect(send_(page)).toHaveAttribute('aria-disabled', 'false', { timeout: scaled(30_000) });
      await send_(page).click();
      await expect(badge(page)).toHaveText('En revisión', { timeout: scaled(30_000) });
      await decision.getByRole('button', { name: 'Aprobar y publicar' }).click();
      const approveDialog = page.getByRole('dialog', { name: 'Aprobar y publicar' });
      await expect(approveDialog).toBeVisible();
      await approveDialog.getByLabel('Nota (opcional)').fill('Cumple con lo acordado.');
      // Una constancia voluntaria con la fecha de AYER (la del servidor llega sin hora: no debe verse corrida un día).
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isoYesterday = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      await approveDialog.getByLabel('Quién revisó').fill('Dra. Ruiz');
      await approveDialog.getByLabel('Fecha de la revisión').fill(isoYesterday);
      await approveDialog.getByLabel('Referencia o acta').fill('Acta 4 de Psicología');
      await approveDialog.getByRole('button', { name: 'Aprobar y publicar' }).click();
      await expect(toast(page, 'El caso se publicó.')).toBeVisible();
      await expect(badge(page)).toHaveText('Publicado', { timeout: scaled(30_000) });
      await expect(decision.getByText('Cumple con lo acordado.')).toBeVisible();
      await expect(decision.getByText(new RegExp(`Constancia de contenido: Dra[.] Ruiz, ${yesterday.getDate()} de .+, Acta 4 de Psicología`))).toBeVisible();
      await expect(page.getByRole('button', { name: 'Crear una versión nueva' })).toBeVisible();

      const lifecycle = (await (await request.get(`/api/authoring/cases/${draft.id}/lifecycle`, { headers: bearer(token) })).json()).data;
      expect(lifecycle['state']).toBe('PUBLISHED');
    } finally {
      // Un caso publicado de más estorbaría a los demás flujos (el catálogo de los estudiantes): se archiva.
      await retire(request, draft.id);
    }
  });

  test('un caso publicado no se cambia: se crea una versión nueva, que se abre en el editor como borrador', async ({ page, request }) => {
    test.setTimeout(scaled(180_000));
    const token = await apiToken(request, ADMIN);
    const draft = await buildPublishableDraft(request, token, { title: `Versión nueva e2e ${Date.now()}` });
    let nueva = 0;
    try {
      await send(request, token, 'post', `/${draft.id}/lifecycle`, { action: 'submit' }, 'enviar a revisión');
      await send(request, token, 'post', `/${draft.id}/lifecycle`, { action: 'approve', note: 'Caso de prueba e2e.', contentReview: contentReviewProof() }, 'aprobar y publicar');
      await loginAs(page, 'admin');
      await openReview(page, draft.id);
      await expect(page.getByText('El caso está publicado. Se puede ver, pero no editar.').first()).toBeVisible({ timeout: scaled(30_000) });
      await sinInfraccionesGraves(page, 'un caso publicado');
      await page.getByRole('button', { name: 'Crear una versión nueva' }).click();
      await page.waitForURL(/\/portal\/casos\/(\d+)\/editor$/, { timeout: scaled(60_000) });
      nueva = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);
      expect(nueva, 'la versión nueva es otra').not.toBe(draft.id);
      await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });
      await expect(page.locator('main [role="note"].solo-lectura')).toHaveCount(0);
      await guardado(page);
      expect((await (await request.get(`/api/authoring/cases/${nueva}/lifecycle`, { headers: bearer(token) })).json()).data.state).toBe('DRAFT');
    } finally {
      await retire(request, draft.id);
      if (nueva) await retire(request, nueva);
    }
  });

  test('el docente envía su caso a revisión pero no puede aprobarlo ni devolverlo (lo decide el servidor)', async ({ page, request }) => {
    test.setTimeout(scaled(150_000));
    const token = await apiToken(request, PROFESOR);
    const draft = await buildPublishableDraft(request, token, { title: `Revisión docente e2e ${Date.now()}` });
    toRetire.push(draft.id);
    await loginAs(page, 'profesor');
    await openReview(page, draft.id);

    await expect(page.getByRole('heading', { name: 'Por resolver (0)' })).toBeVisible({ timeout: scaled(30_000) });
    await expect(send_(page)).toHaveAttribute('aria-disabled', 'false', { timeout: scaled(30_000) });
    await send_(page).click();
    await expect(badge(page)).toHaveText('En revisión', { timeout: scaled(30_000) });

    const decision = page.locator('[data-accion="decision-caso"]');
    await expect(decision.getByRole('button', { name: 'Aprobar y publicar' })).toHaveCount(0);
    await expect(decision.getByRole('button', { name: 'Devolver a borrador' })).toHaveCount(0);
    await expect(decision.getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviar a Psicología' })).toHaveCount(0);
  });
});
