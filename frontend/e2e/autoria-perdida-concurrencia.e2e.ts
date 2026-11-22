import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { crearCasoBienestar, guardado, rutaEditor } from './support/autoria-flujo';
import { CASE_REVISION_HEADER, PROFESOR, apiToken, bearer, readEditor, retireCase } from './support/case-fixtures';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Pasada final de editor-b (E7): lo que el recorrido feliz no prueba, contra el servidor REAL y por la interfaz.
 *
 * - PÉRDIDA: en Datos, un campo con error no retiene a los demás, y cambiar de pantalla con algo que solo está en pantalla
 *   pregunta antes («Seguir editando» se queda).
 * - CONCURRENCIA: otra sesión cambia el caso mientras la docente escribe → el aviso de conflicto, lo escrito sigue a la
 *   vista y, al recargar, la lista de lo que no entró. Adoptar la rúbrica mientras la docente sigue escribiendo → las dos
 *   cosas llegan, sin conflicto. «Probar» con Ctrl mientras un cambio viaja → la pestaña nueva solo va al ensayo después.
 *
 * Para dejar «en vuelo» una petición, la prueba la retiene con `page.route` y la suelta cuando quiere: el servidor la recibe
 * igual, solo más tarde.
 */

/** Retiene las peticiones que cumplan `filtro` hasta que se llame a `soltar`. */
async function retener(page: Page, patron: string | RegExp, filtro: (route: Route) => boolean = () => true) {
  const retenidas: Route[] = [];
  let suelto = false;
  await page.route(patron, async (route) => {
    if (suelto || !filtro(route)) return route.fallback();
    retenidas.push(route);
  });
  return {
    cuantas: () => retenidas.length,
    soltar: async () => {
      suelto = true;
      for (const route of retenidas.splice(0)) await route.fallback();
    },
  };
}

const verAvisos = async (page: Page) => {
  const ver = page.getByRole('button', { name: 'Ver el aviso' });
  if (await ver.isVisible()) await ver.click();
};

test.describe('editor de casos · pérdida y concurrencia (E7)', () => {
  let caseVersionId = 0;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(scaled(300_000));
    await page.setViewportSize({ width: 1366, height: 800 });
    await loginAs(page, 'profesor');
    caseVersionId = await crearCasoBienestar(page, `Pérdida y concurrencia e2e ${Date.now()}`);
  });

  test.afterEach(async ({ request }) => {
    if (caseVersionId) await retireCase(request, caseVersionId).catch(() => undefined);
  });

  // req: RNF-004 (no perder trabajo)
  test('Datos: un nombre vacío no retiene el contexto, y salir con el error a la vista pregunta antes', async ({ page, request }) => {
    await page.goto(rutaEditor(page, '/datos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Datos del caso' })).toBeVisible({ timeout: scaled(30_000) });
    await page.getByLabel('Nombre del caso').fill('');
    const contexto = page.getByLabel('Contexto que lee el estudiante');
    await contexto.fill('Una estudiante llega a Bienestar con una pregunta difícil.');
    await contexto.blur();
    await guardado(page);
    await expect(page.locator('[data-estado-datos]')).toHaveText('Se guardó lo demás. Corrige lo marcado para guardarlo también.');
    const docente = await apiToken(request, PROFESOR);
    const editor = await readEditor(request, docente, caseVersionId);
    expect(editor['context']).toBe('Una estudiante llega a Bienestar con una pregunta difícil.');
    expect(String(editor['title'] ?? '')).not.toBe('');

    // Ir a otra pantalla con el nombre por corregir: se pregunta y «Seguir editando» se queda con lo escrito.
    await page.getByRole('link', { name: /Guion|Escenas/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Hay datos sin guardar' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('el nombre del caso');
    await dialogo.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL(/\/editor\/datos$/);
    await expect(page.getByLabel('Nombre del caso')).toHaveValue('');
  });

  // req: RNF-004, E2-6 (bloqueo optimista)
  test('otra sesión cambia el caso mientras se escribe: aviso, lo escrito sigue y al recargar se lista lo que no entró', async ({ page, request }) => {
    await page.goto(rutaEditor(page, '/datos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Datos del caso' })).toBeVisible({ timeout: scaled(30_000) });
    // Otra pestaña (la misma docente por la API) guarda primero: la revisión sube sin que este editor lo sepa.
    const docente = await apiToken(request, PROFESOR);
    const vista = await readEditor(request, docente, caseVersionId);
    const otra = await request.put(`/api/authoring/cases/${caseVersionId}/brief`, {
      headers: { ...bearer(docente), [CASE_REVISION_HEADER]: String(vista['revision']) },
      data: { context: 'Lo que escribió la otra pestaña.' },
    });
    expect(otra.ok(), `la otra sesión guarda: ${otra.status()}`).toBeTruthy();

    const contexto = page.getByLabel('Contexto que lee el estudiante');
    await contexto.fill('Lo que escribe la docente aquí.');
    await contexto.blur();
    await guardado(page);
    await verAvisos(page);
    const conflicto = page.locator('section.aviso-conflicto');
    await expect(conflicto).toBeVisible({ timeout: scaled(15_000) });
    await expect(contexto).toHaveValue('Lo que escribe la docente aquí.');
    await conflicto.getByRole('button', { name: 'Recargar el caso' }).click();
    await expect(page.getByLabel('Contexto que lee el estudiante')).toHaveValue('Lo que escribió la otra pestaña.', { timeout: scaled(15_000) });
    await verAvisos(page);
    await expect(page.locator('section.aviso-recuperado')).toContainText('Lo que escribe la docente aquí.');
  });

  // req: RK-1 (adoptar la rúbrica) sin perder lo escrito a la vez
  test('adoptar la rúbrica mientras se sigue escribiendo: las dos cosas llegan y no hay conflicto', async ({ page, request }) => {
    const rubrica = await retener(page, /\/api\/authoring\/cases\/\d+\/rubric$/, (r) => r.request().method() === 'POST');
    await page.goto(rutaEditor(page, '/rubrica'));
    await page.getByRole('button', { name: 'Usar las competencias del programa' }).click({ timeout: scaled(30_000) });
    await expect.poll(() => rubrica.cuantas()).toBe(1);

    // Mientras la adopción viaja, la docente cambia de pantalla (dentro del editor) y escribe.
    await page.getByRole('link', { name: /Datos/ }).first().click();
    const contexto = page.getByLabel('Contexto que lee el estudiante');
    await contexto.fill('Escrito mientras se adoptaba la rúbrica.');
    await contexto.blur();
    await rubrica.soltar();
    await guardado(page);

    await expect(page.locator('section.aviso-conflicto')).toHaveCount(0);
    const docente = await apiToken(request, PROFESOR);
    const editor = await readEditor(request, docente, caseVersionId);
    expect(editor['context']).toBe('Escrito mientras se adoptaba la rúbrica.');
    expect((editor['rubrics'] as unknown[]).length).toBeGreaterThan(0);
  });

  // req: especificación 4.3.8 (el ensayo con el borrador al día)
  test('«Probar» con Ctrl mientras un cambio viaja: la pestaña nueva va al ensayo solo cuando el cambio llegó', async ({ page, context }) => {
    await page.goto(rutaEditor(page, '/datos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Datos del caso' })).toBeVisible({ timeout: scaled(30_000) });
    const brief = await retener(page, /\/api\/authoring\/cases\/\d+\/brief$/, (r) => r.request().method() === 'PUT');
    const contexto = page.getByLabel('Contexto que lee el estudiante');
    await contexto.fill('Cambio que todavía viaja.');
    await contexto.blur();
    await expect.poll(() => brief.cuantas()).toBe(1);
    // De vuelta en Revisión (dentro del editor, sin recargar: el cambio sigue en la cola).
    await page.getByRole('link', { name: /Enviar|Revisión/ }).first().click();
    await expect(page.locator('[data-accion="probar"]')).toBeVisible({ timeout: scaled(30_000) });
    const nueva = context.waitForEvent('page');
    await page.locator('[data-accion="probar"]').click({ modifiers: ['Control'] });
    const pestana = await nueva;
    await page.waitForTimeout(500);
    expect(pestana.url(), 'antes de guardar, la pestaña nueva sigue en blanco').toBe('about:blank');
    await brief.soltar();
    await pestana.waitForURL(/\/portal\/casos\/\d+\/ensayo/, { timeout: scaled(30_000) });
    await pestana.close();
  });
});
