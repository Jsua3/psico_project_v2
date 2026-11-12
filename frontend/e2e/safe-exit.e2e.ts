import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { probeStudentConsent } from './support/consent';
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
  nearbyAction,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
  waitUntilPlayerStill,
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
  const pauseDialog = page.getByRole('alertdialog', { name: /pausa/i });
  await expect(pauseDialog, `${state}: debe aparecer la pausa`).toBeVisible({ timeout: scaled(30_000) });
  // F6-6 (H-05): el resultado es un diálogo modal y la pausa lleva el foco a «Reanudar este intento».
  await expect(pauseDialog, `${state}: la pausa es modal`).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: /reanudar este intento/i }), `${state}: el foco entra a «Reanudar»`)
    .toBeFocused();

  const resumed = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await page.getByRole('button', { name: /reanudar este intento/i }).click();
  expect((await resumed).ok(), `${state}: reanudar debe funcionar`).toBe(true);
  await expect(pauseDialog).toBeHidden({ timeout: scaled(30_000) });
  // Al reanudar el foco vuelve a un elemento del juego (o a la tarjeta que reaparece): nunca queda en <body>.
  await expect.poll(
    () => page.evaluate(() => !!document.activeElement && document.activeElement !== document.body),
    { message: `${state}: el foco no queda perdido en <body> tras reanudar`, timeout: scaled(5_000) },
  ).toBe(true);
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

/** Retraso inyectado a la respuesta del servidor (un servidor lento o atascado): mayor que el fundido de escena (320 ms). */
const SLOW_SERVER_MS = 7_000;

/**
 * F1 (REGLA-004): con el fundido de escena a pantalla completa esperando al servidor, «Salida segura» sigue a la
 * vista (nada la cubre en ningún punto de su caja) y se puede pulsar o tocar de verdad. El clic de Playwright
 * comprueba además que ninguna capa recibe el toque, y no espera más de 3 s: si el fundido la tapara, fallaría.
 *
 * `fade: false` es para la decisión con el servidor lento: desde 4.3.3 el orden es reacción en la sala actual, nota de
 * supervisión y, al final, el fundido, así que mientras la petición está pendiente no hay fundido. El resto del contrato
 * no se afloja: el botón sigue siendo el único, visible, nada lo cubre y se puede tocar con la petición pendiente.
 */
async function assertSafeExitAboveFade(page: Page, state: string, touch: boolean, { fade = true }: { fade?: boolean } = {}): Promise<void> {
  if (fade) await expect(page.locator('.scene-fade--active'), `${state}: el fundido de escena debe estar activo`).toHaveCount(1);
  const exit = page.getByRole('button', { name: /salida segura/i });
  await expect(exit, `${state}: un único «Salida segura» bajo el fundido`).toHaveCount(1);
  await expect(exit).toBeVisible();
  const covered = await exit.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return [[.5, .5], [.15, .5], [.85, .5], [.5, .2], [.5, .8]].some(([fx, fy]) => {
      const top = document.elementFromPoint(rect.left + rect.width * fx, rect.top + rect.height * fy);
      return !top || !(button === top || button.contains(top));
    });
  });
  expect(covered, `${state}: algo cubre «Salida segura» (el fundido de escena la tapaba)`).toBe(false);
  if (fade) expect(await page.locator('.scene-fade--active').count(), `${state}: el fundido sigue activo al pulsar`).toBe(1);
  if (touch) await exit.tap({ timeout: 3_000 });
  else await exit.click({ timeout: 3_000 });
  await expect(page.getByRole('button', { name: /pausando/i }), `${state}: el pie acusa la pausa pedida`).toBeVisible();
}

/** La pausa pedida bajo el fundido llega cuando el servidor responde: una sola llamada, pantalla de pausa y sin avisos encima. */
async function expectQueuedPauseThenResume(
  page: Page, state: string, safeExitCalls: () => number, expectedTotalCalls: number,
): Promise<void> {
  const pause = page.getByRole('alertdialog', { name: /pausa/i });
  await expect(pause, `${state}: debe aparecer la pausa`).toBeVisible({ timeout: scaled(40_000) });
  expect(safeExitCalls(), `${state}: una sola llamada a safe-exit por pausa pedida`).toBe(expectedTotalCalls);
  // La pausa corta la reacción en el acto: ningún gesto en curso (`data-reaction`) queda bajo la pantalla de pausa.
  await expect(page.locator('.phaser-host[data-reaction]'), `${state}: un gesto de reacción quedó vivo bajo la pausa`).toHaveCount(0);
  // Ningún aviso de etapa o de sala queda pintado (ni anunciado) encima de la pausa; el aviso de puerta (F6-12) es un
  // aviso del sistema (`.ui-toast`) y la pausa también lo retira.
  await expect(page.locator('.room-banner, .transition-note, .ui-toast'), `${state}: avisos sobre la pausa`).toHaveCount(0);
  await page.getByRole('button', { name: /reanudar este intento/i }).click();
  await expect(pause).toBeHidden({ timeout: scaled(30_000) });
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

      // Consecuencia: se recorre H1 hasta decidir y se pausa con la supervisión a la vista.
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
      const supervision = page.getByRole('dialog', { name: /consecuencia/i });
      await expect(supervision).toBeVisible({ timeout: scaled(30_000) });
      await assertSafeExitPauses(page, 'supervisión', viewport);
    });

    test(`@orientation salida segura bajo el fundido de escena con el servidor lento: puerta y decisión (${viewport.name})`, async ({ page }) => {
      test.setTimeout(scaled(420_000));
      const touch = viewport.inputMode === 'touch';
      const input = createWorldInputDriver(page, viewport.inputMode);
      let safeExitCalls = 0;
      page.on('request', request => {
        if (request.method() === 'POST' && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(request.url()).pathname)) safeExitCalls += 1;
      });
      await page.goto('/login');
      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
      const consent = await enterCaseAtContentWarning(page);
      const introVideo = await acceptContentWarning(page, consent);
      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await waitForWorldReady(page);

      // Recorrido de H1 hasta la puerta de la sala de escucha (mismo camino que full-case, sin sus pausas previas).
      // Desde el punto de salida el kit es lo primero que se alcanza al caminar a la izquierda. En modo compacto la barra
      // solo ofrece el candidato PRINCIPAL: con el jugador entre el kit y la Familia en crisis el botón del kit no existe,
      // así que se recoge antes de acercarse a la familia.
      await input.moveUntilNearby('ArrowLeft', /kit pap/i);
      await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
      await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
      await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
      await useToolChoice(page, /abuela de la niña/i, /aplicar pap a la familia en crisis/i);
      await closeDialogue(page, /herramienta pertinente/i);
      await exploreUntilNearby(page, input, /enfermera de urgencias/i);
      await seekNpcDialogue(page, /enfermera de urgencias/i, input);
      await closeDialogue(page, /enfermera de urgencias/i);
      await exploreUntilNearby(page, input, /sala de escucha familiar/i);

      // 1. Puerta con enter-room lento: el fundido espera y «Salida segura» se toca igualmente.
      const slow = async (route: import('@playwright/test').Route) => {
        await new Promise(resolve => setTimeout(resolve, SLOW_SERVER_MS));
        await route.continue();
      };
      await page.route(/\/api\/simulation\/attempts\/[^/]+\/enter-room$/, slow);
      await waitUntilPlayerStill(page);
      const door = nearbyAction(page, /sala de escucha familiar/i);
      await expect(door).toBeVisible();
      await door.click();
      await assertSafeExitAboveFade(page, 'puerta con el servidor lento', touch);
      await expectQueuedPauseThenResume(page, 'puerta con el servidor lento', () => safeExitCalls, 1);
      await page.unroute(/\/api\/simulation\/attempts\/[^/]+\/enter-room$/, slow);
      await waitForWorldReady(page, 'hospital-sala-escucha');

      // 2. Decisión con /decisions lento: mismo contrato.
      await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
      await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
      const family = await advanceDialogueToChoices(page, /abuela de la niña/i);
      const option = family.getByRole('button', { name: /aplicar pap: contención emocional, acompañamiento en duelo/i });
      await expect(option).toBeVisible();
      await page.route(/\/api\/simulation\/attempts\/[^/]+\/decisions$/, slow);
      await option.click();
      // Sin fundido: la reacción de la sala actual va antes y el fundido solo llega tras la respuesta (4.3.3).
      await assertSafeExitAboveFade(page, 'decisión con el servidor lento', touch, { fade: false });
      await expectQueuedPauseThenResume(page, 'decisión con el servidor lento', () => safeExitCalls, 2);
    });
  });
}

// ── La salida segura NO depende del consentimiento (S3-2b; REGLA-004, ETH-02) ───────────────────────────────────────────

const NOT_ENFORCED = 'El backend de esta corrida no exige el consentimiento (SIEP_CONSENT_REQUIRED apagada). '
  + 'Para probarlo: SIEP_CONSENT_REQUIRED=true node scripts/test-e2e.mjs consent-gate safe-exit';

// req: REGLA-004, ETH-02, ETH-01
test('la salida segura (y reanudar) responde 200 aunque la persona no tenga consentimiento registrado', async ({ request }) => {
  const probe = await probeStudentConsent(request);
  // Sin consentimiento (idempotente): lo que el servidor exija del mundo, la pausa nunca lo pide.
  const withdrawn = await request.delete(`/api/simulation/cases/${probe.caseVersionId}/consent`, { headers: probe.headers });
  expect(withdrawn.status()).toBe(200);
  const started = await request.post('/api/simulation/attempts', { headers: probe.headers, data: { caseVersionId: probe.caseVersionId } });
  expect(started.status(), 'crear o recuperar el intento no pide el aviso: el flujo es intento → aviso → mundo').toBe(200);
  const attempt = (await started.json()).data as { attemptId: string; attemptToken: string };
  const base = `/api/simulation/attempts/${attempt.attemptId}`;

  const world = await request.get(`${base}/world`, { headers: { ...probe.headers, 'X-SIEP-Attempt-Token': attempt.attemptToken } });
  if (probe.state.required) {
    expect(world.status(), 'el servidor exige el consentimiento para el mundo').toBe(403);
    expect((await world.json()).code).toBe('CONSENT_REQUIRED');
  } else {
    expect(world.status()).toBe(200);
  }

  const paused = await request.post(`${base}/safe-exit`, { headers: probe.headers, data: { attemptToken: attempt.attemptToken, reason: 'Prueba e2e sin consentimiento' } });
  expect(paused.status(), 'la salida segura responde 200 sin consentimiento').toBe(200);
  expect((await paused.json()).data.status).toBe('PAUSED');
  const resumed = await request.post(`${base}/resume`, { headers: probe.headers, data: { attemptToken: attempt.attemptToken } });
  expect(resumed.status(), 'reanudar tampoco pide el consentimiento').toBe(200);
  expect((await resumed.json()).data.status).toBe('IN_PROGRESS');
});

// req: REGLA-004, ETH-02, ETH-01
test('con el consentimiento exigido y retirado en otra pestaña, «Salida segura» sigue pausando aunque el guardado de la posición se rechace', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const probe = await probeStudentConsent(request);
  test.skip(!probe.state.required, NOT_ENFORCED);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);

  // En otra pestaña (aquí, por la API) la persona retira su consentimiento.
  expect((await request.delete(`/api/simulation/cases/${probe.caseVersionId}/consent`, { headers: probe.headers })).status()).toBe(200);

  // Un empujón y «Salida segura» de inmediato: el guardado de la posición (que va antes de la pausa) ya no tiene consentimiento…
  const position = page.waitForResponse(response =>
    response.request().method() === 'PATCH' && /\/api\/simulation\/attempts\/[^/]+\/world-state$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  const pause = page.waitForResponse(response =>
    response.request().method() === 'POST' && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
  { timeout: scaled(30_000) });
  await createWorldInputDriver(page, 'keyboard').nudge('ArrowLeft');
  await page.getByRole('button', { name: /salida segura/i }).click();

  const positionResponse = await position;
  expect(positionResponse.status()).toBe(403);
  expect((await positionResponse.json()).code).toBe('CONSENT_REQUIRED');
  // …pero la pausa sale igual (REGLA-004): 200 y el intento queda en pausa.
  const pauseResponse = await pause;
  expect(pauseResponse.status(), 'la salida segura no depende del consentimiento').toBe(200);
  expect((await pauseResponse.json()).data.status).toBe('PAUSED');
  const attemptId = /attempts\/([^/]+)\/safe-exit/.exec(pauseResponse.url())![1];
  const history = (await (await request.get('/api/simulation/attempts/history', { headers: probe.headers })).json()).data as Array<{ attemptId: string; status: string }>;
  expect(history.find(row => row.attemptId === attemptId)?.status).toBe('PAUSED');
  // Sin error genérico en pantalla (lo que sigue es el aviso previo, no «No tienes permisos»).
  await expect(page.getByText('No tienes permisos para realizar esta acción.')).toHaveCount(0);
  await expect(page.locator('.game-failure')).toHaveCount(0);
});
