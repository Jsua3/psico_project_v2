import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { resetStudentConsent } from './support/consent';
import {
  acceptContentWarning,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  enterWorld,
  exploreUntilNearby,
  finishCaseIntroduction,
  leaveBrief,
  loginStudent,
  startFreshAttempt,
  waitForWorldReady,
  waitUntilPlayerStill,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Cromo del juego (plan visual F6-1) en el navegador real: UN solo indicador de arranque, el fallo con «Reintentar»
 * que deja «Salida segura» a la vista (REGLA-004), los avisos del sistema que no tapan lo operable, la cabecera y el
 * pie apagados bajo una capa y un documento que no se desplaza.
 */

const WORLD_URL = '**/api/simulation/attempts/*/world';

async function openLobby(page: Page): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
}

/** Del consentimiento al mundo listo (con las dos tarjetas de introducción por el camino). */
async function reachWorld(page: Page): Promise<void> {
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
}

// req: BLOQUE-H, RNF-004, REGLA-010
test.describe('@game-chrome arranque del juego', () => {
  test('un solo indicador de carga aunque el mundo tarde, y el mundo llega', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    await page.addInitScript(() => {
      const samples: number[] = [];
      (window as unknown as { __bootSamples: number[] }).__bootSamples = samples;
      const count = () => document.querySelectorAll('.game-boot, .world-loading, mat-progress-bar').length;
      new MutationObserver(() => samples.push(count())).observe(document, { childList: true, subtree: true });
    });
    // El mundo tarda: el indicador pasa de los 150 ms y se deja ver, y debe ser UNO (no tres en secuencia).
    await page.route(WORLD_URL, async route => {
      await new Promise(resolve => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await openLobby(page);
    const consent = await enterCaseAtContentWarning(page);
    await consent.getByRole('button', { name: /^continuar$/i }).click();

    // El mundo tarda: el indicador se ve, dice qué pasa y la cabecera y «Salida segura» siguen a la vista (REGLA-004).
    const boot = page.locator('.game-boot');
    await expect(boot).toBeVisible({ timeout: scaled(10_000) });
    await expect(boot).toContainText('Preparando la escena…');
    await expect(page.getByRole('button', { name: /salida segura/i }), 'cargando: un solo botón «Salida segura»').toHaveCount(1);
    await test.info().attach('arranque-cargando', { body: await page.screenshot(), contentType: 'image/png' });

    const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
    await expect(introVideo).toBeVisible({ timeout: scaled(30_000) });
    const caseIntro = await finishCaseIntroduction(page, introVideo);
    await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
    await waitForWorldReady(page);

    const samples = await page.evaluate(() => (window as unknown as { __bootSamples: number[] }).__bootSamples);
    expect(Math.max(...samples), 'el indicador de arranque llegó a verse').toBeGreaterThanOrEqual(1);
    expect(Math.max(...samples), 'nunca dos indicadores de carga a la vez').toBeLessThanOrEqual(1);
    await expect(page.locator('.game-boot')).toHaveCount(0);
    await expect(page.locator('mat-progress-bar')).toHaveCount(0);
  });

  test('un fallo al cargar el mundo: error con «Reintentar», «Salida segura» a la vista y el mundo llega al reintentar', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    let aborted = false;
    await page.route(WORLD_URL, async route => {
      if (!aborted) {
        aborted = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await openLobby(page);
    const consent = await enterCaseAtContentWarning(page);
    await consent.getByRole('button', { name: /^continuar$/i }).click();

    const failure = page.locator('.game-failure');
    await expect(failure).toBeVisible({ timeout: scaled(30_000) });
    await expect(failure).toContainText('No pudimos cargar el mapa del caso.');
    await expect(failure.getByRole('alert')).toBeVisible();
    await expect(failure.locator('.ui-error-state__title'), 'el foco va al título del error').toBeFocused();
    // REGLA-004: con el error en pantalla «Salida segura» sigue a la vista, operable y es UNA sola.
    const exit = page.getByRole('button', { name: /salida segura/i });
    await expect(exit).toHaveCount(1);
    await expect(exit).toBeVisible();
    await expect(exit).toBeEnabled();
    await expect(failure.getByRole('link', { name: 'Volver al simulador' }), 'sin segunda salida: la del pie basta').toHaveCount(0);
    await test.info().attach('fallo-del-mundo', { body: await page.screenshot(), contentType: 'image/png' });

    await failure.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('.game-failure')).toHaveCount(0);
    // El mundo cargó: sigue la introducción y, con ella, el resto de la entrada.
    await expect(page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' })).toBeVisible({ timeout: scaled(30_000) });
  });

  test('un fallo al iniciar el intento: «Reintentar» y «Volver al simulador», sin «Salida segura» (no hay intento)', async ({ page }) => {
    test.setTimeout(scaled(120_000));
    let aborted = false;
    await page.route('**/api/simulation/attempts', async route => {
      if (route.request().method() === 'POST' && !aborted) {
        aborted = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await openLobby(page);
    await resetStudentConsent(page); // el consentimiento vive en el servidor (S3-2b): al reintentar debe volver el aviso
    await page.getByRole('button', { name: /entrar al caso/i }).click();
    await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
    await leaveBrief(page);

    const failure = page.locator('.game-failure');
    // Otra prueba pudo dejar un intento abierto: la tarjeta de reanudar aparece en vez de pedir uno nuevo.
    const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
    await expect(startFresh.or(failure).first()).toBeVisible({ timeout: scaled(30_000) });
    if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
    await expect(failure).toBeVisible({ timeout: scaled(30_000) });
    await expect(failure).toContainText('No pudimos iniciar la simulación.');
    await expect(failure.getByRole('link', { name: 'Volver al simulador' })).toBeVisible();
    await expect(page.getByRole('button', { name: /salida segura/i })).toHaveCount(0);

    await failure.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' })).toBeVisible({ timeout: scaled(30_000) });
  });
});

interface Box { x: number; y: number; width: number; height: number }

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const locator = page.locator(selector).first();
  if (!(await locator.isVisible().catch(() => false))) return null;
  return locator.boundingBox();
}

// req: BLOQUE-H, REGLA-004 (los avisos del sistema no tapan lo operable del juego)
for (const viewport of [
  { width: 1366, height: 768, touch: false },
  { width: 390, height: 844, touch: true },
  { width: 844, height: 390, touch: true },
]) {
  test.describe(`@game-chrome avisos del sistema ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch });

    test('un aviso de conexión queda arriba a la izquierda y no tapa «Salida segura», «Interactuar» ni la cruceta', async ({ page }) => {
      test.setTimeout(scaled(180_000));
      // El archivo estático de la sala falla (la escena cae a su dibujo de respaldo): el interceptor HTTP emite el aviso
      // de conexión (un error, que no se va solo).
      await page.route('**/assets/game/scenarios/*.json', route => route.abort('failed'));
      await openLobby(page);
      await reachWorld(page);

      const toast = page.locator('.ui-toast').first();
      await expect(toast, 'el aviso de conexión se ve y queda hasta cerrarlo').toBeVisible();
      const toastBox = (await toast.boundingBox())!;
      expect(toastBox.x, 'arriba a la izquierda').toBeLessThanOrEqual(24);

      const exit = (await page.getByRole('button', { name: /salida segura/i }).boundingBox())!;
      expect(intersects(toastBox, exit), 'no tapa «Salida segura»').toBe(false);
      for (const selector of ['.context-bar', '.touch-controls', '.right-panel', '.tool-dock']) {
        const other = await boxOf(page, selector);
        if (other) expect(intersects(toastBox, other), `no tapa ${selector}`).toBe(false);
      }
      // El panel de diálogo ocupa a la derecha clamp(340px, 28vw, 480px) (por encima de 760 px; por debajo es una hoja
      // inferior): el aviso, arriba a la izquierda, no llega hasta allí.
      if (viewport.width > 760) {
        const panelWidth = Math.min(480, Math.max(340, viewport.width * 0.28));
        expect(toastBox.x + toastBox.width, 'queda a la izquierda del panel de diálogo').toBeLessThanOrEqual(viewport.width - panelWidth);
      }
    });
  });
}

// req: BLOQUE-H, RNF-04
test.describe('@game-chrome cabecera y pie bajo una capa', () => {
  test('apagados bajo la introducción, el documento no se desplaza y el foco del juego es claro', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    await openLobby(page);
    const consent = await enterCaseAtContentWarning(page);
    const introVideo = await acceptContentWarning(page, consent);

    // Bajo la introducción la cabecera y el pie están inertes y se ven apagados (no «vivos pero muertos»).
    for (const selector of ['header.top-bar', 'footer.bottom-zone']) {
      const region = page.locator(selector);
      await expect(region, selector).toHaveAttribute('inert', '');
      await expect.poll(
        () => region.evaluate(el => Number.parseFloat(getComputedStyle(el).opacity)),
        { message: `${selector} se ve apagado`, timeout: 3_000 },
      ).toBeLessThan(0.8);
    }

    const caseIntro = await finishCaseIntroduction(page, introVideo);
    await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
    await waitForWorldReady(page);

    // El juego a pantalla completa no deja un documento que se desplaza (antes lo evitaba `body.game-mode`).
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow, 'sin desplazamiento del documento').toBeLessThanOrEqual(0);
    await expect(page.locator('body')).not.toHaveClass(/game-mode/);

    // El anillo de foco del juego lo da la piel sobre el contenedor (sin reglas en <body>): el token vale el violeta
    // claro (#C9B3FF) para todo lo que cuelga de `.game-container`.
    const focusToken = await page.locator('.game-container').evaluate(el => getComputedStyle(el).getPropertyValue('--ds-focus').trim());
    expect(focusToken.toLowerCase()).toBe('#c9b3ff');
  });
});

// req: RNF-04, BLOQUE-H (WCAG 2.5.8 objetivos de 44 px; texto de 12 px)
for (const viewport of [
  { name: 'desktop-1366', width: 1366, height: 768, touch: false },
  { name: 'mobile-390', width: 390, height: 844, touch: true },
]) {
  test.describe(`@game-chrome tamaños ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch });

    test('las acciones de la cabecera, la tarjeta y el pie miden 44 px y ningún texto baja de 12 px', async ({ page }) => {
      test.setTimeout(scaled(240_000));
      const input = createWorldInputDriver(page, viewport.touch ? 'touch' : 'keyboard');
      await enterWorld(page);
      // Con una puerta cerca la barra de contexto ofrece su acción: así hay una acción del pie que medir.
      await exploreUntilNearby(page, input, /sala de escucha familiar/i);
      await waitUntilPlayerStill(page);

      for (const selector of ['.hud-action', 'button.context-bar__interaction', '.tool-card', 'app-scene-goal-card .goal-card__toggle']) {
        const items = page.locator(selector);
        const count = await items.count();
        expect(count, `hay al menos un ${selector}`).toBeGreaterThan(0);
        let measured = 0;
        for (let index = 0; index < count; index += 1) {
          const item = items.nth(index);
          if (!(await item.isVisible())) continue;
          const box = (await item.boundingBox())!;
          expect(box.height, `${selector} #${index}: alto`).toBeGreaterThanOrEqual(43.9);
          expect(box.width, `${selector} #${index}: ancho`).toBeGreaterThanOrEqual(43.9);
          measured += 1;
        }
        expect(measured, `${selector}: alguno visible que medir`).toBeGreaterThan(0);
      }

      // Todo texto visible de la cabecera, la ficha del objetivo y el pie, con su tamaño real calculado.
      const small = await page.evaluate(() => {
        const found: string[] = [];
        for (const root of Array.from(document.querySelectorAll('app-simulation-hud, app-scene-goal-card, footer.bottom-zone'))) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = (node.textContent ?? '').trim();
            const element = node.parentElement;
            // Los iconos de Material son texto (ligaduras): se miden en px de glifo, no cuentan como texto.
            if (!text || !element || element.closest('mat-icon, svg')) continue;
            const rect = element.getBoundingClientRect();
            if (element.getClientRects().length === 0 || rect.width < 2 || rect.height < 2) continue;
            const size = Number.parseFloat(getComputedStyle(element).fontSize);
            if (size < 12) found.push(`${element.className || element.tagName}: ${size}px «${text.slice(0, 40)}»`);
          }
        }
        return found;
      });
      expect(small, 'ningún texto visible baja de 12 px').toEqual([]);
    });
  });
}
