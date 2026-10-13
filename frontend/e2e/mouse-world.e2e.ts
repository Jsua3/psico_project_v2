import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  createWorldInputDriver,
  enterWorld,
  exploreUntilNearby,
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
