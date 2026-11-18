import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createWorldInputDriver,
  enterWorld,
  exploreUntilNearby,
  interactNearby,
  nearbyAction,
  waitUntilPlayerStill,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Regiones vivas y avisos del juego (plan visual F6-12; H-08, H-09, H-10, H-23; VD-29): lo que un lector de pantalla
 * recibiría, leído de las DOS regiones persistentes de la app (`[data-live-region]`) con un observador que anota cada
 * escritura. Un mensaje no llega dos veces seguidas, el juego no trae región viva propia, la barra de contexto
 * anuncia solo la interacción y un aviso accionable (la puerta bloqueada) es un aviso del sistema que permanece hasta
 * cerrarse sin tapar «Salida segura» (REGLA-004).
 */

interface LiveWrite { region: 'polite' | 'assertive'; text: string; at: number }

async function installLiveLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: Array<{ region: string; text: string; at: number }> = [];
    (window as unknown as { __liveLog: typeof log }).__liveLog = log;
    const last: Record<string, string> = {};
    new MutationObserver(() => {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-live-region]'))) {
        const region = element.getAttribute('data-live-region') ?? '';
        const text = element.textContent ?? '';
        if (text && text !== last[region]) log.push({ region, text, at: performance.now() });
        last[region] = text;
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

const liveLog = (page: Page) => page.evaluate(() => (window as unknown as { __liveLog: LiveWrite[] }).__liveLog);

interface Box { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  const locator = page.locator(selector).first();
  if (!(await locator.isVisible().catch(() => false))) return null;
  return locator.boundingBox();
}

// req: BLOQUE-H (H-08, H-09, H-10, H-23), RNF-04, REGLA-004
for (const viewport of [
  { name: 'desktop-1366', width: 1366, height: 768, touch: false },
  { name: 'mobile-390', width: 390, height: 844, touch: true },
  { name: 'landscape-844', width: 844, height: 390, touch: true },
]) {
  test.describe(`@live-regions ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch });

    test('un aviso de puerta se anuncia una vez, permanece hasta cerrarse y no tapa «Salida segura»', async ({ page }) => {
      test.setTimeout(scaled(240_000));
      const input = createWorldInputDriver(page, viewport.touch ? 'touch' : 'keyboard');
      await installLiveLog(page);
      await enterWorld(page);

      // Las dos regiones existen desde el arranque y el juego no trae una propia ni mezcla status con assertive.
      await expect(page.locator('[data-live-region]')).toHaveCount(2);
      await expect(page.locator('.game-container [aria-live="assertive"]')).toHaveCount(0);
      await expect(page.locator('[aria-live="assertive"][role="status"]')).toHaveCount(0);
      // La barra de contexto ya no es una región viva: su línea de reposo y su pista de teclas no se anuncian.
      await expect(page.locator('.context-bar')).not.toHaveAttribute('aria-live', /.+/);

      // La puerta sigue bloqueada (no se atendió a la familia): pulsarla da un aviso del sistema que dice qué hacer.
      await exploreUntilNearby(page, input, /sala de escucha familiar/i);
      await waitUntilPlayerStill(page);
      await nearbyAction(page, /sala de escucha familiar/i).click();

      const notice = page.locator('.ui-toast').first();
      await expect(notice).toBeVisible({ timeout: scaled(10_000) });
      const message = ((await notice.locator('.ui-toast__text').textContent()) ?? '').trim();
      expect(message, 'el aviso dice qué hacer').not.toBe('');
      await expect(notice, 'el aviso no es una región viva propia').not.toHaveAttribute('role', /.+/);
      await expect(page.locator('.door-notice, .action-toast'), 'el juego ya no pinta avisos propios').toHaveCount(0);

      // Se anuncia UNA vez, por la región de cortesía (una puerta bloqueada no es urgente).
      await expect.poll(async () => (await liveLog(page)).filter(entry => entry.text === message).length, {
        message: 'el aviso de puerta llegó a la región viva', timeout: scaled(5_000),
      }).toBe(1);
      const written = (await liveLog(page)).filter(entry => entry.text === message);
      expect(written[0].region).toBe('polite');

      // Permanece: pasado el tiempo en que antes se apagaba solo (4,2 s) sigue a la vista y no tapa lo operable.
      await page.waitForTimeout(scaled(5_500));
      await expect(notice, 'el aviso accionable permanece hasta cerrarse').toBeVisible();
      const noticeBox = (await notice.boundingBox())!;
      const exit = (await page.getByRole('button', { name: /salida segura/i }).boundingBox())!;
      expect(intersects(noticeBox, exit), 'no tapa «Salida segura»').toBe(false);
      for (const selector of ['button.context-bar__interaction', '.touch-controls', '.tool-dock', '.right-panel']) {
        const other = await boxOf(page, selector);
        if (other) expect(intersects(noticeBox, other), `no tapa ${selector}`).toBe(false);
      }
      await expect(page.getByRole('button', { name: /salida segura/i }), 'un solo «Salida segura» con el aviso').toHaveCount(1);

      // «Salida segura» sigue operable con el aviso a la vista, pausa de verdad y retira el aviso (era de lo que se hacía).
      const paused = page.waitForResponse(response =>
        response.request().method() === 'POST'
          && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
      { timeout: scaled(30_000) });
      await page.getByRole('button', { name: /salida segura/i }).click({ timeout: scaled(10_000) });
      expect((await paused).ok(), 'el servidor acepta la pausa').toBe(true);
      const pause = page.getByRole('alertdialog', { name: /pausa/i });
      await expect(pause).toBeVisible({ timeout: scaled(30_000) });
      await expect(page.locator('.ui-toast'), 'ningún aviso de lo que se hacía queda sobre la pausa').toHaveCount(0);
      await page.getByRole('button', { name: /reanudar este intento/i }).click();
      await expect(pause).toBeHidden({ timeout: scaled(30_000) });

      // Ningún mensaje llegó dos veces seguidas por el mismo canal dentro de la ventana de repetidos (1 s).
      const log = await liveLog(page);
      for (const region of ['polite', 'assertive'] as const) {
        const own = log.filter(entry => entry.region === region);
        own.forEach((entry, index) => {
          if (index === 0) return;
          const previous = own[index - 1];
          const repeated = previous.text === entry.text && entry.at - previous.at < 1_000;
          expect(repeated, `«${entry.text}» se anunció dos veces seguidas en ${region}`).toBe(false);
        });
      }
    });

    test('«Cerrar» retira el aviso de puerta y no deja el foco perdido', async ({ page }) => {
      test.setTimeout(scaled(240_000));
      const input = createWorldInputDriver(page, viewport.touch ? 'touch' : 'keyboard');
      await enterWorld(page);
      await exploreUntilNearby(page, input, /sala de escucha familiar/i);
      await waitUntilPlayerStill(page);
      await nearbyAction(page, /sala de escucha familiar/i).click();

      const notice = page.locator('.ui-toast').first();
      await expect(notice).toBeVisible({ timeout: scaled(10_000) });
      const close = notice.getByRole('button', { name: /cerrar aviso/i });
      const closeBox = (await close.boundingBox())!;
      // 44 px nominales: el redondeo del diseño responsivo deja 43,99999 en algunas anchuras.
      expect(Math.round(Math.min(closeBox.width, closeBox.height)), 'su «Cerrar» mide 44 px').toBeGreaterThanOrEqual(44);

      await close.click();
      await expect(page.locator('.ui-toast')).toHaveCount(0);
      // Un aviso que aparece o se cierra nunca deja al juego sin «Salida segura» operable.
      await expect(page.getByRole('button', { name: /salida segura/i })).toHaveCount(1);
    });
  });
}

/**
 * ¿La región está EXPUESTA (no ignorada) en el árbol de accesibilidad real de Chromium? Es lo que un lector de
 * pantalla ve: Playwright calcula sus roles por su cuenta y no sabe de la regla de los `aria-modal`.
 */
async function exposedInAxTree(page: Page, politeness: 'polite' | 'assertive'): Promise<boolean> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId, selector: `[data-live-region="${politeness}"]`,
    });
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const ax = nodes.find(candidate => candidate.backendDOMNodeId === node.backendNodeId);
    return !!ax && !ax.ignored;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// req: BLOQUE-H (H-09), RNF-004 (WCAG 4.1.3): el anuncio llega a un lector de pantalla con y sin diálogo modal abierto
test.describe('@live-regions las regiones siguen expuestas con un diálogo modal abierto', () => {
  test('con la bitácora cerrada (un aria-modal oculto en el DOM) y con el panel de diálogo abierto', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    const input = createWorldInputDriver(page, 'keyboard');
    await installLiveLog(page);
    await enterWorld(page);

    // Mundo libre, con la bitácora cerrada: el `aria-modal` oculto de la bitácora NO puede poseer las regiones.
    await page.keyboard.press('e'); // sin nada cerca: «No hay nada a tu alcance…» (una línea que la persona pidió)
    await expect.poll(async () => (await liveLog(page)).some(entry => /alcance/i.test(entry.text)), { timeout: scaled(5_000) }).toBe(true);
    expect(await exposedInAxTree(page, 'polite'), 'región de cortesía expuesta con la bitácora cerrada').toBe(true);
    expect(await exposedInAxTree(page, 'assertive'), 'región assertive expuesta con la bitácora cerrada').toBe(true);

    // Con el panel de diálogo abierto (aria-modal) la primera línea se anuncia y la región sigue expuesta.
    await input.moveUntilNearby('ArrowLeft', /kit pap/i);
    await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
    await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
    await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
    const dialogue = page.getByRole('dialog', { name: /diálogo con/i });
    await expect(dialogue).toBeVisible({ timeout: scaled(10_000) });
    await expect(dialogue).toHaveAttribute('aria-modal', 'true');
    // El texto entero de la línea para el lector va en la placa del que habla (rediseño del panel, `fa2dd43e`).
    const line = ((await dialogue.locator('.placa-habla > .visually-hidden').first().textContent()) ?? '').trim();
    expect(line, 'el diálogo tiene su primera línea').not.toBe('');
    await expect.poll(async () => (await liveLog(page)).some(entry => entry.text.includes(line.slice(0, 40))), {
      message: 'la primera línea del diálogo se anunció (la región del panel ya no nace con su texto)', timeout: scaled(5_000),
    }).toBe(true);
    expect(await exposedInAxTree(page, 'polite'), 'región de cortesía expuesta con el diálogo modal abierto').toBe(true);
    expect(await exposedInAxTree(page, 'assertive'), 'región assertive expuesta con el diálogo modal abierto').toBe(true);

    // Control: sin el `aria-owns` Chromium ocultaría las regiones (la razón de ser del servicio). Si esto fallara, el
    // navegador ya no oculta lo que queda fuera de un modal y el `aria-owns` sería innecesario (no dañino).
    const withoutOwns = await dialogue.evaluate(modal => {
      const owns = modal.getAttribute('aria-owns');
      modal.removeAttribute('aria-owns');
      return owns;
    });
    test.info().annotations.push({ type: 'aria-owns', description: `aria-owns del modal: ${withoutOwns}` });
    expect(withoutOwns, 'el modal poseía las regiones').toContain('siep-live-polite');
    const hiddenWithout = !(await exposedInAxTree(page, 'polite'));
    const verdict = `sin aria-owns la región de cortesía queda ${hiddenWithout ? 'OCULTA (el truco es necesario)' : 'expuesta (el navegador no la oculta)'}`;
    test.info().annotations.push({ type: 'control', description: verdict });
    console.log(`[live-regions] control: ${verdict}`);
  });
});

// req: BLOQUE-H (H-08, H-10), RNF-04
test.describe('@live-regions la barra de contexto anuncia solo la interacción', () => {
  test('al acercarse a algo se anuncia «Interactuar: …» y la línea «Ahora» no se lee', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    const input = createWorldInputDriver(page, 'keyboard');
    await installLiveLog(page);
    await enterWorld(page);

    await input.moveUntilNearby('ArrowLeft', /kit pap/i);
    await expect.poll(async () => (await liveLog(page)).some(entry => /^Interactuar: Recoger Kit PAP/i.test(entry.text)), {
      message: 'la interacción cercana se anuncia', timeout: scaled(5_000),
    }).toBe(true);

    await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
    await expect.poll(async () => (await liveLog(page)).some(entry => /^Obtuviste: Kit PAP/i.test(entry.text)), {
      message: 'lo recogido se anuncia por la región', timeout: scaled(8_000),
    }).toBe(true);

    // Nada de lo escrito en las regiones es la línea de reposo ni la pista de teclas.
    for (const entry of await liveLog(page)) {
      expect(entry.text, 'la línea «Ahora» no se anuncia').not.toMatch(/^Ahora:/);
      expect(entry.text, 'la pista de teclas no se anuncia').not.toMatch(/WASD mover/);
    }
  });
});
