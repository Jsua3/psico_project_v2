import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NodeResult } from 'axe-core';

import { classifyRatio, decodePng, measureCrop, measureText, parseCssColor, requiredRatio } from './support/contrast-pixels';
import type { Rgb, Verdict } from './support/contrast-pixels';
import { visitEditorTabs } from './support/editor-tabs';
import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole, TourRole } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Lectura de los `incomplete` de contraste de Axe (plan visual F9-2: «cada `incomplete` de contraste revisado»).
 * Axe deja como `incomplete` el texto cuyo fondo no puede calcular (degradado, imagen, vidrio con `backdrop-filter`,
 * capas encima). Aquí cada uno de esos elementos se recorta tal como lo pinta el navegador (a ×2): el color del texto
 * sale de `getComputedStyle` (con la opacidad de sus ancestros) y el fondo de los píxeles del recorte —con un degradado
 * se juzga por el peor tramo—, se mide con `support/contrast-pixels.ts` y se compara con el umbral de WCAG 1.4.3 (4,5:1;
 * 3:1 si el texto es grande). NO es una puerta: deja el informe para leerlo y, de lo que no pasa, un recorte para
 * verlo a ojo. Solo corre con SIEP_CONTRAST_REVIEW=1:
 *   SIEP_CONTRAST_REVIEW=1 node scripts/test-e2e.mjs --grep @a11y-contrast-review
 * Salida: `contraste.json`, `contraste-resumen.md` y `recortes/` en <SIEP_UI_BASELINE_DIR> (por defecto
 * `.superpowers/baseline-ui/<fecha>/contraste`).
 */
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }] as const;
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve(process.env['SIEP_UI_BASELINE_DIR'] ?? join(__dirname, '..', '..', '.superpowers', 'baseline-ui', today), 'contraste');
const CROPS_DIR = join(OUT_DIR, 'recortes');

interface Row {
  screen: string;
  viewport: string;
  selector: string;
  text: string;
  /** Por qué Axe no pudo decidir (`messageKey` de su verificación: bgGradient, bgImage, pseudoContent, …). */
  cause: string;
  fontSizePx: number | null;
  fontWeight: number | null;
  required: number | null;
  /** El peor fondo del recorte, y el color del texto ya mezclado con él. */
  background: string | null;
  ink: string | null;
  ratio: number | null;
  verdict: Verdict;
  /** Cuántos tonos de fondo pesan en el recorte: más de uno es un degradado, juzgado por su peor tramo. */
  backgrounds: number | null;
  note: string;
  crop?: string;
}
const rows: Row[] = [];
let cropCount = 0;

const hex = (color: Rgb | null): string | null => (color
  ? `#${[color.r, color.g, color.b].map(value => value.toString(16).padStart(2, '0')).join('')}`
  : null);

async function measureNode(page: Page, node: NodeResult, screen: string, viewport: string): Promise<Row> {
  const targets = node.target.map(String);
  const data = node.any[0]?.data as { messageKey?: string } | undefined;
  const base: Row = {
    screen, viewport, selector: targets.join(' '), text: '', cause: data?.messageKey ?? node.any[0]?.id ?? 'desconocida',
    fontSizePx: null, fontWeight: null, required: null, background: null, ink: null, ratio: null, verdict: 'sin-medida',
    backgrounds: null, note: '',
  };
  if (targets.length !== 1) return { ...base, note: 'el objetivo está dentro de un iframe o de una sombra' };
  try {
    const element = page.locator(targets[0]).first();
    const info = await element.evaluate(el => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      // La opacidad de los ancestros se multiplica: un bloque a 0,6 de opacidad aclara su texto aunque su color sea sólido.
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70),
        fontSizePx: parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400),
        width: box.width,
        height: box.height,
        color: style.color,
        opacity,
      };
    }, undefined, { timeout: 3000 });
    const described = { ...base, text: info.text, fontSizePx: info.fontSizePx, fontWeight: info.fontWeight };
    if (info.width < 1 || info.height < 1) return { ...described, note: 'sin caja visible' };
    await element.scrollIntoViewIfNeeded({ timeout: 3000 });
    const png = await element.screenshot({ timeout: 5000 });
    const color = parseCssColor(info.color);
    if (!color) return { ...described, note: `color del texto ilegible: ${info.color}` };
    const image = decodePng(png);
    const measure = measureText(image, { color, alpha: color.a * info.opacity });
    const required = requiredRatio({ fontSizePx: info.fontSizePx, fontWeight: info.fontWeight });
    let { background, foreground, ratio }: { background: Rgb; foreground: Rgb | null; ratio: number | null } = measure;
    const notes: string[] = [];
    if (!measure.fgSeen) {
      // El color CSS del texto no aparece en el recorte (una capa encima, un filtro, un degradado de texto): se mide el color que
      // SÍ se ve. La cifra es menos fiable (una raya o un icono pueden hacerse pasar por texto) y se anota para mirarla a ojo.
      const observed = measureCrop(image, { dominantOnly: true });
      background = observed.background;
      foreground = observed.ink;
      ratio = observed.ratio;
      notes.push('el color CSS del texto no aparece en el recorte: se midió el color que se ve');
    }
    if (measure.backgrounds > 1) notes.push(`fondo de ${measure.backgrounds} tonos: se juzga por el peor`);
    const verdict: Verdict = classifyRatio(ratio, required);
    const row: Row = {
      ...described, required, background: hex(background), ink: hex(foreground), ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      verdict, backgrounds: measure.backgrounds, note: notes.join(' · '),
    };
    // De lo que no pasa se guarda el recorte y la ventana entera con el elemento marcado, para verlo a ojo en su contexto.
    if (verdict !== 'pasa') {
      cropCount += 1;
      const base = `${String(cropCount).padStart(4, '0')}-${screen.replace(/[^a-z0-9]+/gi, '-')}-${viewport}`;
      row.crop = `${base}.png`;
      mkdirSync(CROPS_DIR, { recursive: true });
      writeFileSync(join(CROPS_DIR, row.crop), png);
      try {
        await element.evaluate(el => { el.setAttribute('data-prev-outline', el.getAttribute('style') ?? ''); (el as HTMLElement).style.outline = '3px solid #e11d48'; (el as HTMLElement).style.outlineOffset = '2px'; });
        writeFileSync(join(CROPS_DIR, `${base}-contexto.png`), await page.screenshot({ scale: 'css', timeout: 5000 }));
      } catch { /* sin contexto: queda el recorte */ } finally {
        await element.evaluate(el => { el.setAttribute('style', el.getAttribute('data-prev-outline') ?? ''); el.removeAttribute('data-prev-outline'); }).catch(() => undefined);
      }
    }
    return row;
  } catch (error) {
    return { ...base, note: `sin captura: ${String(error).split('\n')[0].slice(0, 140)}` };
  }
}

async function review(page: Page, screen: string, viewport: string): Promise<void> {
  const results = await runAxe(page, { rules: ['color-contrast'], resultTypes: ['incomplete'] });
  const nodes = results.incomplete.find(item => item.id === 'color-contrast')?.nodes ?? [];
  for (const node of nodes) rows.push(await measureNode(page, node, screen, viewport));
}

// req: RNF-04, RNF-004, BLOQUE-H
test.describe.configure({ mode: 'serial' });
test.skip(process.env['SIEP_CONTRAST_REVIEW'] !== '1', 'Revisión manual: SIEP_CONTRAST_REVIEW=1');
test.use({ deviceScaleFactor: 2 });

test.afterAll(() => {
  if (!rows.length) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'contraste.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1));
  const count = (pick: (row: Row) => string) => {
    const totals = new Map<string, number>();
    for (const row of rows) totals.set(pick(row), (totals.get(pick(row)) ?? 0) + 1);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  };
  const open = rows.filter(row => row.verdict !== 'pasa');
  writeFileSync(join(OUT_DIR, 'contraste-resumen.md'), [
    `# Lectura de los «incomplete» de contraste (${today})`, '',
    `Elementos que Axe no pudo decidir: ${rows.length}. Medidos con el recorte a ×2 y comparados con 4,5:1 (3:1 si el texto es grande).`, '',
    `Por veredicto: ${count(row => row.verdict).map(([name, total]) => `${name} ${total}`).join(' · ')}`, '',
    `Por causa de Axe: ${count(row => row.cause).map(([name, total]) => `${name} ${total}`).join(' · ')}`, '',
    `A mirar a ojo (no pasan o la medición no vale): ${open.length}`, '',
    '| Pantalla | Ancho | Texto | Causa | Tamaño | Mín. | Medido | Tinta / fondo | Veredicto | Nota | Recorte |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...open.map(row => `| ${row.screen} | ${row.viewport} | ${row.text.replace(/\|/g, '/')} | ${row.cause} | ${row.fontSizePx ?? '—'}/${row.fontWeight ?? '—'} | ${row.required ?? '—'} | ${row.ratio ?? '—'} | ${row.ink ?? '—'} / ${row.background ?? '—'} | ${row.verdict} | ${row.note} | ${row.crop ?? ''} |`),
    '',
  ].join('\n'));
});

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as TourRole[]) {
  test(`@a11y-contrast-review pantallas · ${role}`, async ({ page }) => {
    test.setTimeout(scaled(20 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      for (const viewport of VIEWPORTS) {
        try {
          await page.setViewportSize(viewport);
          await openScreen(page, screen);
          await review(page, `${role}/${screen.id}`, `${viewport.width}x${viewport.height}`);
        } catch (error) {
          rows.push({
            screen: `${role}/${screen.id}`, viewport: `${viewport.width}x${viewport.height}`, selector: '', text: '', cause: 'pantalla', fontSizePx: null, fontWeight: null,
            required: null, background: null, ink: null, ratio: null, verdict: 'sin-medida', backgrounds: null, note: `la pantalla no se pudo revisar: ${String(error).split('\n')[0].slice(0, 140)}`,
          });
        }
      }
    }
  });
}

test('@a11y-contrast-review editor de casos · cada pestaña', async ({ page, request }) => {
  test.setTimeout(scaled(15 * 60_000));
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await visitEditorTabs(page, request, async tab => { await review(page, `admin/editor · ${tab}`, `${viewport.width}x${viewport.height}`); });
  }
});
