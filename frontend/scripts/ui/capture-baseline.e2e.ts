import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { test } from '@playwright/test';

import { TOUR_SCREENS, loginAs, openScreen } from '../../e2e/support/screen-tour';
import type { SignedRole, TourRole } from '../../e2e/support/screen-tour';

/**
 * Capturas por rol × pantalla × ancho (F0-1). No es una prueba: un fallo en una pantalla se anota en
 * `manifest.json` y el recorrido sigue. Uso:
 *   node scripts/test-e2e.mjs --config=scripts/ui/capture.config.ts
 */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;

const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(process.env['SIEP_UI_BASELINE_DIR'] ?? join(__dirname, '..', '..', '..', '.superpowers', 'baseline-ui', today));
const ROLES: TourRole[] = ['publico', 'estudiante', 'profesor', 'admin'];

interface ManifestEntry { role: TourRole; screen: string; viewport: string; file?: string; path?: string; error?: string }
const manifest: ManifestEntry[] = [];

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    files: manifest.filter(entry => entry.file).length,
    errors: manifest.filter(entry => entry.error).length,
    entries: manifest,
  }, null, 2));
});

for (const role of ROLES) {
  test(`capturas · ${role}`, async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      for (const viewport of VIEWPORTS) {
        const label = `${viewport.width}x${viewport.height}`;
        const file = `${role}__${screen.id}__${label}.png`;
        try {
          await page.setViewportSize(viewport);
          const path = await openScreen(page, screen);
          await page.screenshot({ path: join(OUT_DIR, file), fullPage: true });
          manifest.push({ role, screen: screen.id, viewport: label, file, path });
        } catch (error) {
          manifest.push({ role, screen: screen.id, viewport: label, error: String(error).slice(0, 400) });
        }
      }
    }
  });
}

// Galería de shared/ui (F2-9): cada piel por separado (portal y juego), a página completa, en los tres anchos.
test('capturas · galería /dev/ui', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`;
    try {
      await page.setViewportSize(viewport);
      await page.goto('/dev/ui');
      await page.locator('.ui-gallery__skin[data-skin="game"] ui-table').last().waitFor({ state: 'visible', timeout: 30_000 });
      for (const skin of ['portal', 'game']) {
        const file = `dev__galeria-${skin}__${label}.png`;
        await page.locator(`.ui-gallery__skin[data-skin="${skin}"]`).screenshot({ path: join(OUT_DIR, file) });
        manifest.push({ role: 'publico', screen: `galeria-${skin}`, viewport: label, file, path: '/dev/ui' });
      }
    } catch (error) {
      manifest.push({ role: 'publico', screen: 'galeria', viewport: label, error: String(error).slice(0, 400) });
    }
  }
});
