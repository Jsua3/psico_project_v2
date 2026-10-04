import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { GUIDED_VIEWPORTS } from './support/guided-viewports';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  enterDoor,
  exploreUntilNearby,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * AC-2 / REGLA-004 / ETH-02: la salida segura es alcanzable en TODOS los estados
 * jugables (todos menos los dos avisos de contenido ETH-01). En cada estado hay
 * UN solo botón «Salida segura» visible y operativo (no oculto bajo otra capa,
 * ni duplicado, ni deshabilitado) y pulsarlo pausa el intento de verdad: el
 * servidor responde 200 al safe-exit, aparece «Tu caso está en pausa» y
 * «Reanudar este intento» devuelve al jugador al juego.
 *
 * El pie del juego se vuelve `inert` mientras hay una superposición (panel,
 * bitácora, introducción…) y esa superposición trae su propio botón; por eso se
 * cuentan los botones visibles Y no inertes, no los del árbol entero.
 */

const MIN_TARGET_PX = 24; // WCAG 2.2 AA 2.5.8 (el diseño pide 44 con puntero grueso; se registra el tamaño real)

interface SafeExitProbe { where: string; width: number; height: number }

/** Botones «Salida segura» que el estudiante ve y puede pulsar (visibles, fuera de capas inertes u ocultas). */
async function operableSafeExits(page: Page): Promise<SafeExitProbe[]> {
  return page.evaluate(() => {
    const out: Array<{ where: string; width: number; height: number }> = [];
    for (const button of Array.from(document.querySelectorAll<HTMLElement>('button'))) {
      if (!/salida segura/i.test(button.textContent ?? '')) continue;
      if (button.closest('[inert], [aria-hidden="true"]')) continue;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0) continue;
      if (rect.width <= 0 || rect.height <= 0) continue;
      const host = button.closest('[role="dialog"], [role="alertdialog"], app-journal-panel, footer, header, [class*="card"]');
      out.push({
        where: host ? `${host.tagName.toLowerCase()}.${Array.from(host.classList).slice(0, 2).join('.')}` : 'body',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    return out;
  });
}

/** Comprueba, pulsa y reanuda: la prueba de que el botón de ESTE estado pausa de verdad. */
async function assertSafeExitPauses(page: Page, state: string, viewport: { width: number; height: number }): Promise<void> {
  const probes = await operableSafeExits(page);
  expect(probes, `${state}: debe haber UN solo botón «Salida segura» visible y operable (hay ${probes.length}: ${JSON.stringify(probes)})`)
    .toHaveLength(1);
  expect(Math.min(probes[0].width, probes[0].height), `${state}: objetivo táctil demasiado pequeño`)
    .toBeGreaterThanOrEqual(MIN_TARGET_PX);
  // Queda en el informe de Playwright qué botón fue y cuánto mide en cada estado.
  test.info().annotations.push({
    type: 'salida-segura',
    description: `${state}: ${probes[0].where} ${probes[0].width}x${probes[0].height}`,
  });

  const exit = page.getByRole('button', { name: /salida segura/i });
  await expect(exit, `${state}: el árbol de accesibilidad debe tener un único «Salida segura»`).toHaveCount(1);
  await expect(exit).toBeVisible();
  await expect(exit).toBeEnabled();
  const box = await exit.boundingBox();
  expect(box, `${state}: sin caja en pantalla`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);

  const paused = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  // click() falla si otra capa tapa el centro del botón: «operativo» incluye que se pueda tocar.
  await exit.click({ timeout: scaled(10_000) });
  expect((await paused).ok(), `${state}: el servidor debe aceptar la pausa`).toBe(true);
  await expect(page.getByRole('alertdialog', { name: /pausa/i }), `${state}: debe aparecer la pausa`)
    .toBeVisible({ timeout: scaled(30_000) });

  const resumed = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await page.getByRole('button', { name: /reanudar este intento/i }).click();
  expect((await resumed).ok(), `${state}: reanudar debe funcionar`).toBe(true);
  await expect(page.getByRole('alertdialog', { name: /pausa/i })).toBeHidden({ timeout: scaled(30_000) });
}

/** Tras reanudar desde la introducción o el contexto reaparece lo que no se había leído: se avanza hasta el mundo. */
async function advanceToWorld(page: Page): Promise<void> {
  const world = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
  const deadline = Date.now() + scaled(60_000);
  while (Date.now() < deadline) {
    if (await introVideo.isVisible().catch(() => false)) {
      await introVideo.getByRole('button', { name: /saltar video|continuar/i }).click();
    } else if (await caseIntro.isVisible().catch(() => false)) {
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
    } else if (await world.isVisible().catch(() => false)
      && await caseIntro.isHidden().catch(() => true)
      && await introVideo.isHidden().catch(() => true)) {
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('No se llegó al mundo tras reanudar desde la introducción');
}

for (const viewport of GUIDED_VIEWPORTS) {
  test.describe(`safe-exit-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@orientation salida segura: introducción, contexto, exploración, ayuda, Ajustes y bitácora (${viewport.name})`, async ({ page }) => {
      test.setTimeout(scaled(240_000));
      // Con la ayuda de primera vez a la vista: es uno de los estados que cubre AC-2.
      await page.goto('/login');
      await loginStudent(page, { seedHelp: false });
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });

      const consent = await enterCaseAtContentWarning(page);
      const introVideo = await acceptContentWarning(page, consent);

      await expect(introVideo).toBeVisible();
      await assertSafeExitPauses(page, 'introducción', viewport);
      await expect(introVideo, 'al reanudar reaparece la introducción sin leer').toBeVisible({ timeout: scaled(30_000) });

      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await expect(caseIntro).toBeVisible();
      await assertSafeExitPauses(page, 'contexto', viewport);
      await advanceToWorld(page);
      await waitForWorldReady(page);

      // Exploración con la tarjeta de ayuda de primera vez a la vista.
      const helpCard = page.locator('app-game-help[view="card"]');
      await expect(helpCard).toBeVisible();
      await assertSafeExitPauses(page, 'exploración con la ayuda de primera vez', viewport);
      await helpCard.getByRole('button', { name: /entendido/i }).click();
      await expect(helpCard).toBeHidden();
      await assertSafeExitPauses(page, 'exploración', viewport);

      // Pantalla «Cómo se juega» abierta.
      await page.getByRole('button', { name: /abrir cómo se juega/i }).click();
      await expect(page.locator('app-game-help[view="screen"]')).toBeVisible();
      await assertSafeExitPauses(page, 'ayuda «Cómo se juega» abierta', viewport);
      await waitForWorldReady(page);

      // Ajustes del juego.
      await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
      await expect(page.getByRole('dialog', { name: /ajustes/i })).toBeVisible();
      await assertSafeExitPauses(page, 'Ajustes', viewport);
      const closeSettings = page.getByRole('button', { name: /cerrar ajustes/i });
      if (await closeSettings.isVisible().catch(() => false)) await closeSettings.click();
      await waitForWorldReady(page);

      // Bitácora reflexiva.
      await page.getByRole('button', { name: /abrir bitácora reflexiva/i }).click();
      await expect(page.getByRole('dialog', { name: /bitácora reflexiva cifrada/i })).toBeVisible();
      await assertSafeExitPauses(page, 'bitácora', viewport);
      await waitForWorldReady(page);
    });

    test(`@orientation salida segura: diálogo sin opciones, con opciones y supervisión (${viewport.name})`, async ({ page }) => {
      test.setTimeout(scaled(360_000));
      const input = createWorldInputDriver(page, viewport.inputMode);
      await page.goto('/login');
      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
      const consent = await enterCaseAtContentWarning(page);
      const introVideo = await acceptContentWarning(page, consent);
      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await waitForWorldReady(page);

      // Diálogo con opciones (la Familia en crisis ofrece una herramienta que aún no se tiene).
      await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
      await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
      const family = await advanceDialogueToChoices(page, /abuela de la niña/i);
      await expect(family.getByRole('group', { name: /opciones de intervención/i })).toBeVisible();
      await assertSafeExitPauses(page, 'diálogo con opciones', viewport);
      await expect(page.getByRole('dialog', { name: /diálogo con/i }), 'la pausa descarta el diálogo').toBeHidden();
      await waitForWorldReady(page);

      // Diálogo sin opciones (conversación informativa con la enfermera).
      await exploreUntilNearby(page, input, /enfermera de urgencias/i);
      await seekNpcDialogue(page, /enfermera de urgencias/i, input);
      const nurse = page.getByRole('dialog', { name: /enfermera de urgencias/i });
      await expect(nurse.getByRole('group', { name: /opciones de intervención/i })).toHaveCount(0);
      await assertSafeExitPauses(page, 'diálogo sin opciones', viewport);
      await waitForWorldReady(page);

      // Supervisión clínica: se recorre H1 hasta decidir y se pausa con la supervisión a la vista.
      // Tras la conversación con la enfermera el jugador queda junto a ella (más arriba que el kit): se explora.
      await exploreUntilNearby(page, input, /kit pap/i);
      await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
      await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
      await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
      await useToolChoice(page, /abuela de la niña/i, /aplicar pap a la familia en crisis/i);
      await closeDialogue(page, /herramienta pertinente/i);
      await exploreUntilNearby(page, input, /enfermera de urgencias/i);
      await seekNpcDialogue(page, /enfermera de urgencias/i, input);
      await closeDialogue(page, /enfermera de urgencias/i);
      await exploreUntilNearby(page, input, /sala de escucha familiar/i);
      await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
      await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
      await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
      await chooseDecision(
        page,
        /abuela de la niña/i,
        /aplicar pap: contención emocional, acompañamiento en duelo/i,
      );
      const supervision = page.getByRole('dialog', { name: /supervisión clínica/i });
      await expect(supervision).toBeVisible({ timeout: scaled(30_000) });
      await assertSafeExitPauses(page, 'supervisión', viewport);
    });
  });
}
