import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test } from '@playwright/test';

import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole, TourRole } from './support/screen-tour';

/**
 * Subconjunto de Material Symbols (plan visual F1-3; revisión de F1, C2): un icono fuera del subconjunto se
 * pinta como texto recortado. El extractor de nombres es una heurística; esta prueba mira lo que de verdad se
 * pinta en las pantallas de los tres roles.
 */
const included = new Set<string>(JSON.parse(readFileSync(join(__dirname, '..', 'scripts', 'ui', 'material-symbols-rounded.icons.json'), 'utf8')));

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as TourRole[]) {
  test(`@icons cada icono pintado está en el subconjunto · ${role}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    const missing: string[] = [];
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      await openScreen(page, screen);
      const names = await page.$$eval('.mat-icon, .material-symbols-rounded', nodes =>
        nodes.map(node => (node.textContent ?? '').trim()).filter(text => /^[a-z0-9_]+$/.test(text)));
      for (const name of names) if (!included.has(name)) missing.push(`${screen.id}: ${name}`);
    }
    expect([...new Set(missing)]).toEqual([]);
  });
}
