import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { leaveBrief, loginAs, readPlayerPosition, startFreshAttempt, waitForWorldReady } from './support/siep-flow';
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
    // Cada petición hasta poder caminar (dirección, tipo, bytes por la red), para ver qué se descarga y por qué.
    const urls = new Map<string, { url: string; tipo: string }>();
    const peticiones: { url: string; tipo: string; bytes: number; ms: number }[] = [];
    let caminando = false;
    let inicio = Date.now();
    cdp.on('Network.responseReceived', (e: { requestId: string; type: string; response: { url: string } }) => {
      urls.set(e.requestId, { url: e.response.url, tipo: e.type });
    });
    cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => {
      bytes += e.encodedDataLength;
      const r = urls.get(e.requestId);
      if (r && !caminando) peticiones.push({ ...r, bytes: e.encodedDataLength, ms: Date.now() - inicio });
    });

    // 1. Primera carga (caché vacía): la página de inicio de sesión servida compilada por el servidor del aula.
    await page.goto('about:blank');
    inicio = Date.now();
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
    // Aviso de contenido, «Antes de comenzar» y lo que venga: se pasa cada «Continuar» con el teclado (laten para llamar la
    // atención y nunca están quietos para un clic) hasta que el mundo está listo. Un intento anterior se descarta.
    const mundo = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
    const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
    const limite = Date.now() + scaled(120_000);
    while (Date.now() < limite && !(await mundo.isVisible().catch(() => false))) {
      if (await startFresh.isVisible().catch(() => false)) { await startFreshAttempt(page, startFresh); continue; }
      const continuar = page.getByRole('dialog').getByRole('button', { name: /^continuar$/i }).first();
      if (await continuar.isVisible().catch(() => false)) { await continuar.press('Enter').catch(() => undefined); await page.waitForTimeout(400); }
      else await page.waitForTimeout(250);
    }
    await waitForWorldReady(page);
    const hastaCaminar = Date.now() - entrar;
    caminando = true;
    if (process.env['SIEP_E2E_AULA_INFORME']) writeFileSync(process.env['SIEP_E2E_AULA_INFORME'], JSON.stringify(peticiones, null, 1));

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
