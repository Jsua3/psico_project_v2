import { expect, test } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Vista previa del editor de casos (plan visual F8-6), contra el servidor REAL: «Recargar» y cambiar de nodo no
 * desmontan el tablero (el mismo `<canvas>` de Phaser sigue en el DOM y el mundo vuelve a estar listo) y la vista
 * previa no muestra métricas inventadas («Puntaje» +10 por decisión, «Estrés» 0 %).
 */
const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};

// req: RNF-04
test('«Recargar» no desmonta el tablero de la vista previa y no muestra puntaje ni estrés inventados', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const login = await request.post('/api/auth/login', { data: ADMIN });
  const token: string = (await login.json()).data.token;
  const created = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `Vista previa e2e ${Date.now()}` },
  });
  expect(created.status(), 'crear el caso').toBe(200);
  const view = (await created.json()).data;
  const id: number = view.caseVersionId;

  await loginAs(page, 'admin');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/portal/casos/${id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: view.title })).toBeVisible({ timeout: scaled(30_000) });

  const isPreview = (r: { request(): { method(): string }; url(): string }) =>
    r.request().method() === 'GET' && r.url().includes(`/api/authoring/cases/${id}/world-preview`);

  const firstLoad = page.waitForResponse(isPreview, { timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Vista previa' }).click();
  expect((await firstLoad).status(), 'GET world-preview').toBe(200);

  const preview = page.locator('app-world-preview');
  const ready = preview.locator('[data-world-ready="true"]');
  await expect(ready).toHaveCount(1, { timeout: scaled(30_000) });
  await expect(preview.locator('.preview-feedback')).toHaveText('Vista previa lista.');
  await expect(preview).not.toContainText(/Puntaje|Estrés/);

  // El mismo lienzo de Phaser: se le pone una marca que solo sobrevive si el elemento no se vuelve a crear.
  const board = preview.locator('.preview-stage canvas').first();
  await expect(board).toBeVisible();
  await board.evaluate(element => element.setAttribute('data-marca', 'sigo-aqui'));

  const reloaded = page.waitForResponse(isPreview, { timeout: scaled(30_000) });
  await page.getByRole('button', { name: 'Recargar' }).click();
  expect((await reloaded).status(), 'GET world-preview (recarga)').toBe(200);

  await expect(preview.locator('.preview-feedback')).toHaveText('Vista previa actualizada.');
  await expect(ready).toHaveCount(1, { timeout: scaled(30_000) });
  await expect(preview.locator('canvas[data-marca="sigo-aqui"]'), 'el lienzo no se desmontó').toHaveCount(1);
  await expect(preview).not.toContainText(/Puntaje|Estrés/);
});
