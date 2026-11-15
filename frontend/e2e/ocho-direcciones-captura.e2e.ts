import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { entrarALaPrimeraSala } from './support/autoria-flujo';

/**
 * Captura del juego real con el jugador caminando en diagonal (bloque G1, diseño 6: ocho direcciones).
 *
 * Camina abajo-izquierda y arriba-derecha manteniendo dos teclas, captura mientras camina y después de soltarlas
 * (debe quedar mirando en diagonal: el margen de `direccion-ocho.ts` no lo devuelve a una cardinal). No juzga píxeles:
 * es evidencia para mirar a ojo.
 *
 * Se corre contra la pila de G1 (`.superpowers/scripts/levantar-g1.ps1`):
 *   E2E_BASE_URL=http://localhost:4382 npx playwright test e2e/ocho-direcciones-captura.e2e.ts
 */

const CARPETA = process.env['G1_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-g1');

test.describe('ocho direcciones en el juego real (captura)', () => {
  test.setTimeout(180_000);

  for (const [ancho, alto] of [[1366, 768], [1920, 1080]] as const) {
    test(`el jugador camina en diagonal a ${ancho} × ${alto}`, async ({ page }) => {
      mkdirSync(CARPETA, { recursive: true });
      await page.setViewportSize({ width: ancho, height: alto });
      page.on('pageerror', e => console.log('[pageerror]', e.message));
      await entrarALaPrimeraSala(page);
      const mundo = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
      await expect(mundo).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1200);
      const foto = (nombre: string) => page.screenshot({ path: path.join(CARPETA, `juego-real-${nombre}-${ancho}x${alto}.png`) });

      for (const [teclas, nombre] of [[['s', 'a'], 'abajo-izquierda'], [['w', 'd'], 'arriba-derecha']] as const) {
        for (const tecla of teclas) await page.keyboard.down(tecla);
        await page.waitForTimeout(650);
        await foto(`caminando-${nombre}`);
        await page.waitForTimeout(250);
        // Se sueltan una tras otra, como hace una persona: debe quedar mirando en diagonal.
        await page.keyboard.up(teclas[0]);
        await page.waitForTimeout(30);
        await page.keyboard.up(teclas[1]);
        await page.waitForTimeout(500);
        await foto(`quieto-${nombre}`);
      }
    });
  }
});
