import { expect, test } from '@playwright/test';

import { readJson } from './support/api-bodies';
import { probeStudentConsent } from './support/consent';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * REGLA-004 sin red (tropiezo bloqueante B1 del recorrido como estudiante, 2026-11-16): «Salida segura» saca a la persona
 * del caso EN EL ACTO aunque no haya conexión. La pausa queda pendiente de registrar, la pantalla de pausa lo dice y,
 * al volver la red, la pausa se registra sola (el servidor responde 200 con el intento en `PAUSED`) sin que la persona
 * tenga que volver a pulsar nada. Antes de la ronda V3 la pausa fallaba con «No pudimos registrar la salida segura.» y
 * la persona seguía dentro del caso sensible.
 *
 * `context.setOffline(true)` apaga `navigator.onLine` y, al devolverla, dispara el evento `online`; la captura de cuerpos
 * de la API pide desde Node y no la ve, así que además se cortan las peticiones a `/api/**` de esta página mientras
 * dura el corte.
 */
test.use({ viewport: { width: 1366, height: 768 } });

const SAFE_EXIT = /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/;

test('@orientation sin red, «Salida segura» saca en el acto y registra la pausa al volver la conexión', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const probe = await probeStudentConsent(request);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);

  // Corte de red: el navegador queda sin conexión y toda petición a la API de esta página falla como sin red.
  let offline = true;
  let failedSafeExits = 0;
  await page.route('**/api/**', async route => {
    if (!offline) return route.fallback();
    if (route.request().method() === 'POST' && SAFE_EXIT.test(new URL(route.request().url()).pathname)) failedSafeExits += 1;
    return route.abort('internetdisconnected');
  });
  await page.context().setOffline(true);

  const pauseDialog = page.getByRole('alertdialog', { name: /pausa/i });
  const clickedAt = Date.now();
  await page.getByRole('button', { name: /salida segura/i }).click();
  // Sale en el acto: la pantalla de pausa no espera a la red (el plazo de una acción es de 15 s; aquí, 3 s como mucho).
  await expect(pauseDialog, 'sin red, la salida segura debe sacar de inmediato a la pantalla de pausa').toBeVisible({ timeout: 3_000 });
  test.info().annotations.push({ type: 'salida-sin-red', description: `pausa a la vista en ${Date.now() - clickedAt} ms` });
  await expect(pauseDialog).toHaveAttribute('aria-modal', 'true');
  // El juego queda detrás: ninguna conversación abierta sobre la pausa y ningún aviso de fallo.
  await expect(page.getByRole('dialog', { name: /diálogo con/i })).toHaveCount(0);
  await expect(page.getByText(/no pudimos registrar la salida segura/i), 'sin red no es un fallo: la persona ya salió').toHaveCount(0);
  // La pantalla de pausa dice que la pausa se registrará al volver la conexión.
  const pending = pauseDialog.getByRole('status').filter({ hasText: /conexi[oó]n/i });
  await expect(pending, 'la pausa pendiente de registrar se explica en la pantalla de pausa').toBeVisible({ timeout: scaled(5_000) });
  await expect.poll(() => failedSafeExits, { message: 'se intentó registrar la pausa sin red', timeout: scaled(10_000) })
    .toBeGreaterThan(0);
  // La nota ya lo explica: el aviso global de conexión no sale sobre la pausa (le tapaba el título).
  await expect(page.getByText(/no fue posible conectar con el servidor/i), 'el aviso global no tapa la pausa')
    .toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('salida-segura-sin-red.png') });

  // Vuelve la red: la pausa se registra sola, sin otro toque.
  const registered = page.waitForResponse(response =>
    response.request().method() === 'POST' && SAFE_EXIT.test(new URL(response.url()).pathname) && response.ok(),
  { timeout: scaled(45_000) });
  offline = false;
  await page.context().setOffline(false);
  const pauseResponse = await registered;
  expect((await readJson(pauseResponse)).data.status, 'el servidor deja el intento en pausa').toBe('PAUSED');
  const attemptId = /attempts\/([^/]+)\/safe-exit/.exec(pauseResponse.url())![1];
  const history = (await (await request.get('/api/simulation/attempts/history', { headers: probe.headers })).json()).data as
    Array<{ attemptId: string; status: string }>;
  expect(history.find(row => row.attemptId === attemptId)?.status, 'la pausa quedó registrada en el servidor').toBe('PAUSED');
  await expect(pending, 'con la pausa registrada la nota de conexión se retira').toHaveCount(0, { timeout: scaled(10_000) });
  await expect(pauseDialog).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('salida-segura-registrada.png') });

  // Y se puede reanudar con normalidad.
  const resumed = page.waitForResponse(response =>
    response.request().method() === 'POST' && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await page.getByRole('button', { name: /reanudar este intento/i }).click();
  expect((await resumed).ok(), 'reanudar tras la pausa registrada').toBe(true);
  await expect(pauseDialog).toBeHidden({ timeout: scaled(30_000) });
});
