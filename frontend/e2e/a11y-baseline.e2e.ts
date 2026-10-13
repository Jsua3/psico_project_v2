import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';

import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole, TourRole } from './support/screen-tour';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  openFamilyDialogue,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Línea base de accesibilidad (plan visual F0-9; el «antes» de RNF-04, RNF-004 y el Bloque H, hallazgo H-20).
 * NO es una puerta: registra violaciones e `incomplete` de WCAG 2.0/2.1/2.2 A y AA y best-practice por rol,
 * pantalla y ancho, y los estados del juego. Fuera de la puerta de CI: solo corre con SIEP_A11Y_BASELINE=1.
 *   SIEP_A11Y_BASELINE=1 node scripts/test-e2e.mjs --grep @a11y-baseline
 * Salida: `a11y.json` y `a11y-resumen.md` en SIEP_UI_BASELINE_DIR (por defecto `.superpowers/baseline-ui/<fecha>`).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const;
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(process.env['SIEP_UI_BASELINE_DIR'] ?? join(__dirname, '..', '..', '.superpowers', 'baseline-ui', today));

interface Finding { id: string; impact: string | null; help: string; nodes: number; targets: string[] }
interface ScreenRecord { id: string; role: TourRole; viewport: string; path?: string; violations: Finding[]; incomplete: Finding[]; error?: string }
const records: ScreenRecord[] = [];

const summarize = (results: Result[]): Finding[] => results.map(result => ({
  id: result.id,
  impact: result.impact ?? null,
  help: result.help,
  nodes: result.nodes.length,
  targets: result.nodes.slice(0, 5).map(node => node.target.join(' ')),
}));

/**
 * Axe calcula el contraste con la opacidad de ese instante: un diálogo auditado a media entrada (fundido) sale con
 * 1,0–1,3:1 aunque, ya asentado, pase. Se espera a que terminen las animaciones y transiciones FINITAS (las
 * infinitas, como un indicador de carga, no terminan nunca) con un tope, y un respiro para el repintado.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const end = animation.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end);
    });
    await Promise.race([
      Promise.allSettled(finite.map(animation => animation.finished)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  });
  await page.waitForTimeout(150);
}

async function audit(page: Page, record: Omit<ScreenRecord, 'violations' | 'incomplete'>): Promise<void> {
  try {
    await settle(page);
    const results: AxeResults = await runAxe(page, { tags: TAGS, resultTypes: ['violations', 'incomplete'] });
    records.push({ ...record, violations: summarize(results.violations), incomplete: summarize(results.incomplete) });
  } catch (error) {
    records.push({ ...record, violations: [], incomplete: [], error: String(error).slice(0, 300) });
  }
}

// req: RNF-04, RNF-004 (línea base de BLOQUE-H, hallazgo H-20)
test.describe.configure({ mode: 'serial' });
test.skip(process.env['SIEP_A11Y_BASELINE'] !== '1', 'Línea base manual: SIEP_A11Y_BASELINE=1');

test.afterAll(() => {
  if (!records.length) return;
  mkdirSync(OUT_DIR, { recursive: true });
  let commit = 'desconocido';
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* sin git */ }
  const byImpact: Record<string, number> = {};
  const byRule: Record<string, { impact: string | null; screens: number; nodes: number }> = {};
  for (const record of records) {
    for (const finding of record.violations) {
      byImpact[finding.impact ?? 'sin impacto'] = (byImpact[finding.impact ?? 'sin impacto'] ?? 0) + 1;
      const rule = byRule[finding.id] ?? { impact: finding.impact, screens: 0, nodes: 0 };
      rule.screens += 1;
      rule.nodes += finding.nodes;
      byRule[finding.id] = rule;
    }
  }
  const incompleteTotal = records.reduce((sum, record) => sum + record.incomplete.length, 0);
  writeFileSync(join(OUT_DIR, 'a11y.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), commit, tags: TAGS,
    summary: { screens: records.length, errors: records.filter(r => r.error).length, violationsByImpact: byImpact, incomplete: incompleteTotal },
    byRule, screens: records,
  }, null, 2));
  const rows = Object.entries(byRule).sort((a, b) => b[1].screens - a[1].screens)
    .map(([id, rule]) => `| ${id} | ${rule.impact ?? '—'} | ${rule.screens} | ${rule.nodes} |`);
  writeFileSync(join(OUT_DIR, 'a11y-resumen.md'), [
    `# Línea base de Axe (${today}, ${commit})`, '',
    `Etiquetas: ${TAGS.join(', ')}. Pantallas y estados auditados: ${records.length} (con error: ${records.filter(r => r.error).length}). Hallazgos «incomplete»: ${incompleteTotal}.`, '',
    `Violaciones por impacto (pantalla × regla): ${Object.entries(byImpact).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ninguna'}`, '',
    '| Regla | Impacto | Pantallas | Nodos |', '|---|---|---|---|', ...rows, '',
  ].join('\n'));
});

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as const) {
  test(`@a11y-baseline pantallas · ${role}`, async ({ page }) => {
    test.setTimeout(scaled(15 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      for (const viewport of VIEWPORTS) {
        const label = `${viewport.width}x${viewport.height}`;
        try {
          await page.setViewportSize(viewport);
          const path = await openScreen(page, screen);
          await audit(page, { id: screen.id, role, viewport: label, path });
        } catch (error) {
          records.push({ id: screen.id, role, viewport: label, violations: [], incomplete: [], error: String(error).slice(0, 300) });
        }
      }
    }
  });
}

for (const viewport of VIEWPORTS) {
  test(`@a11y-baseline juego · ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(scaled(6 * 60_000));
    const label = `${viewport.width}x${viewport.height}`;
    const state = (id: string) => ({ id: `juego-${id}`, role: 'estudiante' as const, viewport: label });
    await page.setViewportSize(viewport);
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
    const consent = await enterCaseAtContentWarning(page);
    await audit(page, state('aviso-contenido'));
    const introVideo = await acceptContentWarning(page, consent);
    await audit(page, state('introduccion'));
    const caseIntro = await finishCaseIntroduction(page, introVideo);
    await audit(page, state('contexto'));
    await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
    await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]')).toBeVisible({ timeout: scaled(45_000) });
    await audit(page, state('mundo'));

    await page.getByRole('button', { name: /abrir cómo se juega/i }).click();
    await audit(page, state('ayuda'));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
    await expect(page.getByRole('dialog', { name: /ajustes/i })).toBeVisible();
    await audit(page, state('ajustes'));
    await page.getByRole('button', { name: /cerrar ajustes/i }).click();

    await page.getByRole('button', { name: /abrir bitácora reflexiva/i }).click();
    const journal = page.getByRole('dialog', { name: /bitácora reflexiva cifrada/i });
    await expect(journal).toBeVisible();
    await audit(page, state('bitacora'));
    await journal.getByRole('button', { name: /cerrar bitácora/i }).click();

    await openFamilyDialogue(page, false);
    await audit(page, state('dialogo'));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /salida segura/i }).first().click();
    await expect(page.getByRole('button', { name: /reanudar este intento/i })).toBeVisible({ timeout: scaled(30_000) });
    await audit(page, state('pausa-salida-segura'));
  });
}
