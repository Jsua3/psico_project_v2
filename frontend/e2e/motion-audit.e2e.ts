import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { visitEditorTabs } from './support/editor-tabs';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Auditoría de movimiento en el navegador (plan visual F9-1; RNF-04, RNF-005): en cada pantalla del recorrido, ya
 * asentada, NO queda ningún bucle infinito que no sea un indicador de carga (esqueleto, spinner, barra de progreso) y
 * ningún elemento anima con `transition: all`. El mismo criterio está en `ui:lint` para el código; esto lo mide en
 * lo que el navegador realmente pinta.
 */
const LOADING = /skeleton|shimmer|spinner|progress|boot/i;

interface Finding { screen: string; loops: string[]; transitionAll: string[] }

/** Lo que el navegador tiene animando ahora: bucles infinitos (por nombre) y elementos con `transition: all` activa. */
async function measure(page: Page, screen: string): Promise<Finding | null> {
  // Las animaciones finitas terminan solas; los bucles de carga ya no deberían estar.
  await page.waitForTimeout(2500);
  const found = await page.evaluate(() => {
    const loops = document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations === Infinity)
      .map(animation => (animation as CSSAnimation).animationName || animation.id || 'sin nombre');
    const transitionAll = new Set<string>();
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      const properties = style.transitionProperty.split(',').map(part => part.trim());
      const durations = style.transitionDuration.split(',').map(part => Number.parseFloat(part));
      if (properties.includes('all') && durations.some(duration => duration > 0)) {
        transitionAll.add(`${element.tagName.toLowerCase()}.${String(element.className ?? '').split(/\s+/).slice(0, 2).join('.')}`);
      }
    }
    return { loops, transitionAll: Array.from(transitionAll).slice(0, 12) };
  });
  const loops = found.loops.filter(name => !LOADING.test(name));
  return loops.length || found.transitionAll.length ? { screen, loops, transitionAll: found.transitionAll } : null;
}

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as const) {
  // req: RNF-04, RNF-005
  test(`@motion-audit ${role}: sin bucles infinitos que no sean de carga y sin «transition: all»`, async ({ page }) => {
    test.setTimeout(scaled(8 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    await page.setViewportSize({ width: 1440, height: 900 });
    const findings: Finding[] = [];
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      await openScreen(page, screen);
      const finding = await measure(page, screen.id);
      if (finding) findings.push(finding);
    }
    expect(findings, 'pantallas con movimiento fuera de criterio').toEqual([]);
  });
}

// req: RNF-04, RNF-005
test('@motion-audit editor de casos: cada pantalla (mapa, guion, sala, finales y revisión) sin movimiento fuera de criterio', async ({ page, request }) => {
  test.setTimeout(scaled(5 * 60_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const findings: Finding[] = [];
  await visitEditorTabs(page, request, async tab => {
    const finding = await measure(page, `editor · ${tab}`);
    if (finding) findings.push(finding);
  });
  expect(findings, 'pestañas del editor con movimiento fuera de criterio').toEqual([]);
});
