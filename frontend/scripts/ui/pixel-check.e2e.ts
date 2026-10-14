import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { expect, test } from '@playwright/test';

import { enterCaseAtContentWarning, loginStudent, waitForWorldReady } from '../../e2e/support/siep-flow';

/**
 * Verificación a ojo de la nitidez del mundo (plan visual F0-7 y F0-8; REGLA-009): con zoom de cámara entero
 * ≥ 2 y la cámara siguiendo a la jugadora, cada texel debe ocupar un bloque uniforme de zoom × zoom píxeles en
 * todos los cuadros, y los rótulos deben leerse sin bloques. Toma instantáneas NATIVAS del lienzo
 * (`renderer.snapshot`; el panel del navegador pierde el canvas) mientras la jugadora camina.
 *   SIEP_PIXEL_LABEL=antes node scripts/test-e2e.mjs --config=scripts/ui/pixel-check.config.ts
 * Salida: <SIEP_UI_BASELINE_DIR>/pixel/<etiqueta>/zoom<k>-<n>.png (+ recorte ×4 alrededor de la jugadora).
 */
const label = process.env['SIEP_PIXEL_LABEL'] ?? 'sin-etiqueta';
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(resolve(process.env['SIEP_UI_BASELINE_DIR'] ?? join(__dirname, '..', '..', '..', '.superpowers', 'baseline-ui', today)), 'pixel', label);

const CASES = [
  { name: 'zoom-medio', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { name: 'zoom-alto', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 },
];

interface Shot { full: string; crop: string; zoom: number; scrollX: number; scrollY: number; playerX: number; playerY: number; worldX: number; roundMode: string; cropX: number; cropY: number }

for (const item of CASES) {
  test.describe(item.name, () => {
    test.use({ viewport: item.viewport, deviceScaleFactor: item.deviceScaleFactor, reducedMotion: 'reduce' });

    test(`nitidez del mundo en movimiento · ${item.name}`, async ({ page }) => {
      test.setTimeout(5 * 60_000);
      // Con movimiento reducido el juego salta el video de introducción: aviso → contexto → mundo.
      await page.goto('/login');
      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });
      const consent = await enterCaseAtContentWarning(page);
      await consent.getByRole('button', { name: /^continuar$/i }).click();
      const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
      await expect(caseIntro).toBeVisible({ timeout: 30_000 });
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await waitForWorldReady(page);
      mkdirSync(OUT_DIR, { recursive: true });
      const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
      await host.click({ position: { x: 5, y: 5 } }).catch(() => undefined);
      const shots: Shot[] = [];
      await page.keyboard.down('ArrowRight');
      for (let frame = 0; frame < 6; frame += 1) {
        await page.waitForTimeout(110);
        shots.push(await page.evaluate(() => new Promise<Shot>((done, fail) => {
          const ng = (window as unknown as { ng: { getComponent(el: Element): unknown } }).ng;
          const component = ng.getComponent(document.querySelector('app-game-world')!) as {
            phaserGame: { renderer: { snapshot(cb: (img: HTMLImageElement) => void): void } };
            scene: { cameras: { main: { zoom: number; scrollX: number; scrollY: number; x: number; y: number; worldView: { x: number; y: number } } }; player?: { x: number }; playerSprite?: { vertexRoundMode?: string } };
          };
          const cam = component.scene.cameras.main;
          const hostEl = document.querySelector<HTMLElement>('app-game-world .phaser-host')!;
          const px = Number(hostEl.dataset['playerX']);
          const py = Number(hostEl.dataset['playerY']);
          component.phaserGame.renderer.snapshot(img => {
            try {
              const canvas = document.createElement('canvas');
              const size = 160;
              canvas.width = size * 4;
              canvas.height = size * 4;
              const ctx = canvas.getContext('2d')!;
              ctx.imageSmoothingEnabled = false;
              const cx = cam.x + (px - cam.worldView.x) * cam.zoom;
              const cy = cam.y + (py - cam.worldView.y) * cam.zoom;
              ctx.drawImage(img, cx - size / 2, cy - size * 0.8, size, size, 0, 0, size * 4, size * 4);
              done({ full: img.src, crop: canvas.toDataURL('image/png'), zoom: cam.zoom, scrollX: cam.scrollX, scrollY: cam.scrollY, playerX: px, playerY: py,
                worldX: component.scene.player?.x ?? NaN, roundMode: component.scene.playerSprite?.vertexRoundMode ?? 'desconocido', cropX: cx - size / 2, cropY: cy - size * 0.8 });
            } catch (error) { fail(error); }
          });
        })));
      }
      await page.keyboard.up('ArrowRight');
      const meta = shots.map((shot, index) => {
        const base = `${item.name}-zoom${shot.zoom}-${index}`;
        writeFileSync(join(OUT_DIR, `${base}.png`), Buffer.from(shot.full.split(',')[1], 'base64'));
        writeFileSync(join(OUT_DIR, `${base}-recorte.png`), Buffer.from(shot.crop.split(',')[1], 'base64'));
        return { file: base, zoom: shot.zoom, scrollX: shot.scrollX, scrollY: shot.scrollY, playerX: shot.playerX, playerY: shot.playerY, worldX: shot.worldX, roundMode: shot.roundMode, cropX: shot.cropX, cropY: shot.cropY };
      });
      writeFileSync(join(OUT_DIR, `${item.name}.json`), JSON.stringify({ label, viewport: item.viewport, deviceScaleFactor: item.deviceScaleFactor, shots: meta }, null, 2));
    });
  });
}
