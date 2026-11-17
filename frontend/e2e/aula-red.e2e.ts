import { expect, test } from '@playwright/test';

import { acceptContentWarning, leaveBrief, loginAs, readPlayerPosition, startFreshAttempt, waitForWorldReady } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * El modo aula de verdad: un estudiante entra por la IP del equipo en la red (no por localhost), inicia sesión, abre el
 * primer caso de su lobby (SIM-VBG-002) y camina. Fuera de localhost la página no es un «contexto seguro» (http://<ip>): la
 * prueba lo comprueba, porque ahí no existen crypto.randomUUID ni otras API.
 *
 * Mide, a 1366 × 768 y con la CPU ×4 (como un portátil modesto): la primera carga de la página, lo descargado y el tiempo
 * hasta poder caminar en el caso. Corre contra el aula levantada con levantar-aula.ps1; la cuenta llega por el entorno:
 *   SIEP_E2E_AULA_URL=http://192.168.1.11:8200 E2E_AULA_EMAIL=… E2E_AULA_PASSWORD=… npx playwright test e2e/aula-red.e2e.ts
 */
const URL_AULA = process.env['SIEP_E2E_AULA_URL'] ?? '';
const CUENTA = { email: process.env['E2E_AULA_EMAIL'] ?? '', password: process.env['E2E_AULA_PASSWORD'] ?? '' };

test.describe('modo aula por la red local', () => {
  test.skip(!URL_AULA || !CUENTA.email, 'Corre con SIEP_E2E_AULA_URL, E2E_AULA_EMAIL y E2E_AULA_PASSWORD (aula levantada)');
  test.use({ baseURL: URL_AULA, viewport: { width: 1366, height: 768 } });

  test('@aula un estudiante entra por la IP, inicia sesión y camina en el caso, con la CPU ×4', async ({ page }) => {
    test.setTimeout(scaled(300_000));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    let bytes = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength; });

    // 1. Primera carga (caché vacía): la página de inicio de sesión servida compilada por el servidor del aula.
    const inicio = Date.now();
    await page.goto('/login', { waitUntil: 'load' });
    const primeraCarga = Date.now() - inicio;
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: scaled(30_000) });
    const bytesPrimeraCarga = bytes;
    expect(new URL(page.url()).hostname, 'se entra por la IP de la red, no por localhost').not.toMatch(/^(localhost|127\.)/);
    expect(await page.evaluate(() => window.isSecureContext), 'http://<ip> no es un contexto seguro').toBe(false);

    // 2. Inicia sesión por la IP (cookies y CSRF sin HTTPS) y abre el primer caso del lobby.
    await loginAs(page, CUENTA);
    await page.goto('/portal/jugar');
    await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(60_000) });
    const entrar = Date.now();
    await page.getByRole('button', { name: /entrar al caso/i }).click();
    await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(60_000) });
    await leaveBrief(page);
    const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
    const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
    await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(60_000) });
    if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
    const tarjeta = await acceptContentWarning(page, consent);
    await tarjeta.getByRole('button', { name: /^continuar$/i }).click();
    await waitForWorldReady(page);
    const hastaCaminar = Date.now() - entrar;

    // 3. Camina: la posición del jugador cambia con el teclado.
    const antes = await readPlayerPosition(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await readPlayerPosition(page)).x, { timeout: scaled(15_000) }).not.toBe(antes.x);

    const medidas = {
      url: URL_AULA, primeraCargaMs: primeraCarga, kbPrimeraCarga: Math.round(bytesPrimeraCarga / 1024),
      hastaCaminarMs: hastaCaminar, kbHastaCaminar: Math.round(bytes / 1024), cpu: '×4', viewport: '1366x768',
    };
    console.log(`MEDIDAS_AULA ${JSON.stringify(medidas)}`);
    await test.info().attach('medidas-aula.json', { body: JSON.stringify(medidas, null, 2), contentType: 'application/json' });
  });
});
