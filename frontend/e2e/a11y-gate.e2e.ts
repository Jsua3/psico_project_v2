import { writeFileSync } from 'fs';
import { expect, test } from '@playwright/test';

import { visitEditorTabs } from './support/editor-tabs';
import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole, TourRole } from './support/screen-tour';
import { scanUi } from './support/ui-scan';
import { scaled } from './support/time-scale';

/**
 * Puerta de accesibilidad de TODAS las pantallas del recorrido (plan visual F9-2; RNF-04, RNF-03, RNF-004): Axe con
 * wcag2a/2aa/21a/21aa/22aa en tres anchos (1440, 768 y 390) y en los cuatro roles: 0 violaciones `serious` o
 * `critical`. Aparte, el escáner de estilos computados mide texto < 12 px y objetivos < 24 px (y < 44 px) y deja el
 * informe en `F9_SCAN_OUT` si se define; el trinquete de esas cifras vive en `a11y-scan.e2e.ts`.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }] as const;
const REPORT = process.env['F9_SCAN_OUT'];

const seriousOf = (where: string, results: Awaited<ReturnType<typeof runAxe>>): string[] => results.violations
  .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
  .map(violation => `${where}: ${violation.id} [${violation.impact}] ×${violation.nodes.length} ${violation.nodes[0]?.target.join(' ')}`);

/**
 * EXCEPCIÓN DOCUMENTADA (decisión del usuario, 2026-11-12): un solo nodo y una sola regla. El mapa del editor en un caso
 * de solo lectura (`.marco` con «Mapa del caso (solo lectura)») y `scrollable-region-focusable`. Es un falso positivo de
 * Axe: su `focusDisabled` (axe-core 4.14, axe.js:19995) trata como no enfocable TODO lo que está dentro de un
 * `fieldset disabled`, y el editor bloquea así los casos que ya no son borrador; pero el mapa sí recibe el foco con Tab
 * (tabindex="0", comprobado en Chromium) y se desplaza con el teclado. El arreglo de fondo (sacar la pantalla del mapa del
 * fieldset y resolver el solo lectura en el propio editor) queda pendiente para cuando el Bloque C2 termine de tocar el editor.
 */
const esMapaDeSoloLectura = (ruleId: string, html: string): boolean =>
  ruleId === 'scrollable-region-focusable' && /class="marco"/.test(html) && /aria-label="Mapa del caso \(solo lectura\)/.test(html);

interface ScanRow { key: string; smallText: number; smallTargets: number; touchTargets: number; samples: string[] }
const rows: ScanRow[] = [];

test.afterAll(() => {
  if (REPORT && rows.length) writeFileSync(REPORT, JSON.stringify(rows, null, 1));
});

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as TourRole[]) {
  // req: RNF-04, RNF-03, RNF-004
  test(`@a11y-gate ${role}: Axe sin serious ni critical en cada pantalla y ancho`, async ({ page }) => {
    test.setTimeout(scaled(15 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    const blocking: string[] = [];
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await openScreen(page, screen);
        await page.waitForTimeout(150);
        const results = await runAxe(page, { tags: TAGS, resultTypes: ['violations'] });
        for (const violation of results.violations) {
          if (violation.impact !== 'serious' && violation.impact !== 'critical') continue;
          const nodes = violation.nodes.filter(node => !esMapaDeSoloLectura(violation.id, node.html));
          if (nodes.length === 0) continue;
          blocking.push(`${role}/${screen.id}@${viewport.width}: ${violation.id} [${violation.impact}] ×${nodes.length} ${nodes[0]?.target.join(' ')}`);
        }
        if (REPORT) {
          const scan = await scanUi(page);
          rows.push({
            key: `${role}/${screen.id}@${viewport.width}`,
            smallText: scan.smallText.length, smallTargets: scan.smallTargets.length, touchTargets: scan.touchTargets.length,
            samples: [...scan.smallText, ...scan.smallTargets, ...scan.touchTargets].slice(0, 24),
          });
        }
      }
    }
    expect(blocking, 'violaciones serias o críticas').toEqual([]);
  });
}

// req: RNF-04, RNF-03, RNF-004
test('@a11y-gate editor de casos: Axe sin serious ni critical en cada pestaña y ancho', async ({ page, request }) => {
  test.setTimeout(scaled(10 * 60_000));
  const blocking: string[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await visitEditorTabs(page, request, async tab => {
      blocking.push(...seriousOf(`editor · ${tab}@${viewport.width}`, await runAxe(page, { tags: TAGS, resultTypes: ['violations'] })));
    });
  }
  expect(blocking, 'violaciones serias o críticas').toEqual([]);
});
