import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createWorldInputDriver,
  enterWorld,
  exploreUntilNearby,
  readPlayerPosition,
  waitUntilPlayerStill,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * El mundo responde al ratón (plan visual F6-7, VD-5): al pasar el puntero por lo que el jugador ya podría saber
 * (dentro del radio de percepción o ya examinado) se resalta con contorno y verbo y el cursor cambia a `pointer`; el
 * mundo vacío no resalta nada. `data-world-hover` del host es la clave señalada (contrato del e2e: el contorno y el
 * cursor viven en el lienzo).
 */

interface Point { x: number; y: number }

const hoverKey = (page: Page) => page.locator('app-game-world .phaser-host').getAttribute('data-world-hover');
const canvasCursor = (page: Page) => page.locator('app-game-world canvas').evaluate(el => getComputedStyle(el).cursor);

/** Recorre el lienzo con el ratón en una rejilla y devuelve el primer punto donde algo se resalta. */
async function sweepForHover(page: Page, accept: (key: string) => boolean = () => true): Promise<{ key: string; at: Point } | null> {
  const box = await page.locator('app-game-world canvas').boundingBox();
  if (!box) return null;
  const STEP = 36;
  for (let y = box.y + 48; y < box.y + box.height - 48; y += STEP) {
    for (let x = box.x + 24; x < box.x + box.width - 24; x += STEP) {
      await page.mouse.move(x, y);
      const key = await hoverKey(page);
      if (key && accept(key)) return { key, at: { x, y } };
    }
  }
  return null;
}

/** Un punto del lienzo, lejos de `avoid`, donde el ratón no resalta nada. */
async function findEmptyPoint(page: Page, avoid: Point): Promise<Point | null> {
  const box = await page.locator('app-game-world canvas').boundingBox();
  if (!box) return null;
  for (let y = box.y + 60; y < box.y + box.height - 60; y += 60) {
    for (let x = box.x + 40; x < box.x + box.width - 40; x += 60) {
      if (Math.hypot(x - avoid.x, y - avoid.y) < 220) continue;
      await page.mouse.move(x, y);
      if ((await hoverKey(page)) === null) return { x, y };
    }
  }
  return null;
}

// req: BLOQUE-H, RNF-04 (VD-5, VD-19)
test.describe('@mouse-world hover', () => {
  test('el puntero sobre lo cercano lo resalta con cursor «pointer» y sobre el suelo vacío no resalta nada', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    const input = createWorldInputDriver(page, 'keyboard');
    await enterWorld(page);
    // Junto a la puerta de la sala de escucha: está a su alcance, dentro del radio de percepción.
    await exploreUntilNearby(page, input, /sala de escucha familiar/i);
    await waitUntilPlayerStill(page);

    const found = await sweepForHover(page);
    expect(found, 'algo cercano se resalta al pasar el ratón').not.toBeNull();
    await expect.poll(() => canvasCursor(page), { message: 'el cursor dice que se puede actuar' }).toBe('pointer');

    // En un punto vacío (lejos de lo resaltado) no se resalta nada y el cursor vuelve al de siempre.
    const empty = await findEmptyPoint(page, found!.at);
    expect(empty, 'hay suelo vacío donde el ratón no resalta nada').not.toBeNull();
    await page.mouse.move(empty!.x, empty!.y);
    await expect.poll(() => hoverKey(page), { message: 'el suelo vacío no resalta nada' }).toBeNull();
    await expect.poll(() => canvasCursor(page)).not.toBe('pointer');
  });
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// req: BLOQUE-H, RNF-04 (VD-5)
test.describe('@mouse-world clic para caminar', () => {
  test('un clic en el suelo camina hasta ahí y se detiene; una tecla de movimiento cancela el destino', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await enterWorld(page);
    const box = (await page.locator('app-game-world canvas').boundingBox())!;
    const center: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // El jugador queda cerca del centro del lienzo (la cámara lo sigue): un clic cercano en alguna dirección con suelo.
    let walked: { dx: number; dy: number; from: Point; to: Point } | null = null;
    for (const [dx, dy] of [[150, 0], [-150, 0], [0, 110], [0, -110]]) {
      const from = await readPlayerPosition(page);
      await page.mouse.click(center.x + dx, center.y + dy);
      await page.waitForTimeout(scaled(900));
      await waitUntilPlayerStill(page);
      const to = await readPlayerPosition(page);
      if (distance(from, to) > 10) {
        walked = { dx, dy, from, to };
        break;
      }
    }
    expect(walked, 'un clic en el suelo mueve al jugador').not.toBeNull();
    // Llegó y se detuvo: sin teclas pulsadas no sigue caminando.
    const settled = await readPlayerPosition(page);
    await page.waitForTimeout(scaled(600));
    expect(await readPlayerPosition(page), 'llegó y se detuvo').toEqual(settled);

    // Un destino más lejano: a media caminata una tecla de movimiento lo cancela y al soltarla no se retoma.
    await page.mouse.click(center.x + walked!.dx * 2.2, center.y + walked!.dy * 2.2);
    await expect.poll(async () => distance(await readPlayerPosition(page), settled), {
      message: 'el jugador empieza a caminar', timeout: scaled(5_000),
    }).toBeGreaterThan(8);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(scaled(150));
    await page.keyboard.up('ArrowUp');
    await waitUntilPlayerStill(page);
    const afterKey = await readPlayerPosition(page);
    await page.waitForTimeout(scaled(900));
    expect(await readPlayerPosition(page), 'la tecla canceló el destino: no retoma la caminata').toEqual(afterKey);
  });

  test('un clic sobre la ayuda abierta no camina', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await enterWorld(page);
    await page.getByRole('button', { name: /abrir cómo se juega/i }).click();
    const sheet = page.locator('.help-screen');
    await expect(sheet).toBeVisible();
    const before = await readPlayerPosition(page);
    const box = (await sheet.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(scaled(900));
    expect(await readPlayerPosition(page), 'un clic sobre la ayuda no es un destino').toEqual(before);
  });
});

// req: BLOQUE-H, RNF-04 (VD-5)
test.describe('@mouse-world cruceta por entrada real', () => {
  test('un toque muestra la cruceta aunque el puntero principal sea fino y mover el ratón la oculta', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await enterWorld(page);
    const dpad = page.locator('app-game-world .touch-controls');
    await expect(dpad, 'con ratón y sin toques no hay cruceta').toBeHidden();

    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    });
    await expect(dpad, 'el primer toque la muestra').toBeVisible();

    await page.mouse.move(300, 300);
    await page.mouse.move(340, 320);
    await expect(dpad, 'mover el ratón la oculta').toBeHidden();
  });
});
