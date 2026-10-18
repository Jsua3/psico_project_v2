import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { enterWorld } from '../../e2e/support/siep-flow';

/**
 * Cuadros por segundo del mundo (plan visual F9-3; RNF-05): con la jugadora quieta y caminando a derecha e izquierda se
 * cuentan los cuadros de `requestAnimationFrame` (lo que el monitor deja pintar) durante 4 s y se lee la cuenta de
 * Phaser (`loop.actualFps`). Sirve para comparar una rama con una línea base guardada (la de F5/F6 está en
 * `.superpowers/baseline-ui/F6-despues/fps/`): lo que importa es la diferencia entre dos corridas de la MISMA máquina, no la
 * cifra suelta.
 *   SIEP_FPS_LABEL=F9-gpu node scripts/test-e2e.mjs --config=scripts/ui/fps-check.config.ts
 * Salida: <SIEP_UI_BASELINE_DIR>/fps/<etiqueta>-<caso>.json, con la misma forma que las de la línea base.
 */
const label = process.env['SIEP_FPS_LABEL'] ?? 'sin-etiqueta';
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(resolve(process.env['SIEP_UI_BASELINE_DIR'] ?? join(__dirname, '..', '..', '..', '.superpowers', 'baseline-ui', today)), 'fps');
const WINDOW_MS = 4000;

const CASES = [
  { name: 'z1-1366x768', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  { name: 'z2-1920x1080', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { name: 'z3-1600x900-dpr2', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 },
];

interface Sample { frames: number; ms: number; fps: number; phaserFps: number; zoom: number }

/** Cuenta los cuadros de rAF durante `duration` ms y lee la cuenta de Phaser y el zoom de la cámara al terminar. */
async function sample(page: Page, duration: number): Promise<Sample> {
  return page.evaluate(window0 => new Promise<Sample>(done => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames += 1;
      if (now - start < window0) {
        requestAnimationFrame(tick);
        return;
      }
      const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
      const host = document.querySelector('app-game-world');
      const component = ng && host ? ng.getComponent(host) as {
        phaserGame?: { loop?: { actualFps?: number } };
        scene?: { cameras?: { main?: { zoom?: number } } };
      } : null;
      done({
        frames,
        ms: now - start,
        fps: frames / ((now - start) / 1000),
        phaserFps: component?.phaserGame?.loop?.actualFps ?? Number.NaN,
        zoom: component?.scene?.cameras?.main?.zoom ?? Number.NaN,
      });
    };
    requestAnimationFrame(tick);
  }), duration);
}

async function walking(page: Page, key: 'ArrowRight' | 'ArrowLeft'): Promise<Sample> {
  await page.keyboard.down(key);
  try {
    return await sample(page, WINDOW_MS);
  } finally {
    await page.keyboard.up(key);
  }
}

for (const item of CASES) {
  test.describe(item.name, () => {
    test.use({ viewport: item.viewport, deviceScaleFactor: item.deviceScaleFactor });

    test(`cuadros por segundo del mundo · ${item.name}`, async ({ page }) => {
      test.setTimeout(5 * 60_000);
      await enterWorld(page);
      const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
      await expect(host).toBeVisible();
      await host.click({ position: { x: 5, y: 5 } }).catch(() => undefined);
      // Un respiro para que el primer cuadro caro (texturas, fuentes) no cuente.
      await page.waitForTimeout(1500);

      const idle = await sample(page, WINDOW_MS);
      const right = await walking(page, 'ArrowRight');
      const left = await walking(page, 'ArrowLeft');

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, `${label}-${item.name}.json`), JSON.stringify({
        label, case: item.name, args: process.env['E2E_CHROMIUM_ARGS'] ?? '(sin argumentos: SwiftShader por defecto)', idle, right, left,
      }, null, 2));
      console.log(`FPS ${label} ${item.name}: quieta ${idle.fps.toFixed(1)} (Phaser ${idle.phaserFps.toFixed(1)}), derecha ${right.fps.toFixed(1)} (${right.phaserFps.toFixed(1)}), izquierda ${left.fps.toFixed(1)} (${left.phaserFps.toFixed(1)}), zoom ${idle.zoom}`);
    });
  });
}
