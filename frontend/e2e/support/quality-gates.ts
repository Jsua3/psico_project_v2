import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import axe from 'axe-core';
import type { AxeResults } from 'axe-core';

import { scaled } from './time-scale';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

interface GeometryAudit {
  viewport: { width: number; height: number };
  issues: string[];
}

export async function assertQualityState(
  page: Page,
  testInfo: TestInfo,
  stateLabel: string,
): Promise<void> {
  await waitForSettledOverlays(page);
  await assertNoBlockingAxeViolations(page, testInfo, stateLabel);
  const geometry = await auditGeometry(page);
  expect(geometry.issues, `${stateLabel}: ${geometry.issues.join('\n')}`).toEqual([]);
}

async function waitForSettledOverlays(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const activeOverlays = Array.from(document.querySelectorAll<HTMLElement>(
      '[role="dialog"]:not([aria-hidden="true"]), [role="menu"]',
    )).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    });
    return activeOverlays.every(element => Number.parseFloat(getComputedStyle(element).opacity) >= 0.99);
  }, undefined, { timeout: scaled(10_000) });
  await waitForFiniteAnimations(page);
}

/**
 * Axe mide el contraste con los colores calculados en ese instante: una transición o una animación FINITA aún en curso
 * (la entrada del panel, el fondo del botón «Salida segura», un botón que pasa de apagado a activo al terminar de cargar)
 * da un color intermedio y un falso «color-contrast». Las infinitas (cursor, pulsos) no se esperan.
 */
async function waitForFiniteAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every(animation => {
    const timing = animation.effect?.getComputedTiming();
    return animation.playState !== 'running' || timing === undefined || timing.iterations === Infinity;
  }), undefined, { timeout: scaled(10_000) });
}

export interface AxeAuditOptions {
  tags: string[];
  resultTypes: Array<'violations' | 'incomplete' | 'passes' | 'inapplicable'>;
  /** Selector CSS del subárbol a auditar (por defecto, todo el documento). */
  include?: string;
}

/**
 * Corre Axe sobre el documento con las etiquetas pedidas. Lo usan la puerta de calidad (solo violaciones
 * `serious`/`critical` de WCAG 2.1) y la línea base de F0-9 (WCAG 2.2 + best-practice, con `incomplete`).
 */
export async function runAxe(page: Page, options: AxeAuditOptions): Promise<AxeResults> {
  const installed = await page.evaluate(() => Boolean((window as typeof window & { axe?: unknown }).axe));
  if (!installed) await page.addScriptTag({ content: axe.source });
  // Quien llama a Axe directo (sin la puerta de calidad) también mide sobre colores ya asentados.
  await waitForFiniteAnimations(page);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForFunction(() => {
      const axeApi = (window as typeof window & { axe?: { _running?: boolean } }).axe;
      return axeApi !== undefined && axeApi._running !== true;
    }, undefined, { timeout: scaled(30_000) });
    try {
      return await page.evaluate(async ({ tags, resultTypes, include }) => {
        const axeApi = (window as typeof window & {
          axe: { run(root: Document | { include: string[] }, options: unknown): Promise<AxeResults> };
        }).axe;
        return axeApi.run(include ? { include: [include] } : document, {
          runOnly: { type: 'tag', values: tags },
          resultTypes,
        });
      }, options);
    } catch (error) {
      if (!String(error).includes('Axe is already running') || attempt === 2) throw error;
    }
  }
  throw new Error('Axe no devolvió resultados');
}

async function assertNoBlockingAxeViolations(
  page: Page,
  testInfo: TestInfo,
  stateLabel: string,
): Promise<void> {
  let results: AxeResults;
  try {
    results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'] });
  } catch (error) {
    throw new Error(`${stateLabel}: ${String(error)}`);
  }

  const blocking = results.violations.filter(violation =>
    violation.impact !== null && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length > 0) {
    await testInfo.attach(`${stateLabel}-axe-blocking.json`, {
      body: JSON.stringify(blocking, null, 2),
      contentType: 'application/json',
    });
  }

  const summary = blocking.map(violation => {
    const nodes = violation.nodes
      .map(node => `${node.target.join(' ')} :: ${node.failureSummary ?? node.html}`)
      .join('\n');
    return `[${violation.impact}] ${violation.id}: ${violation.help}\n${nodes}`;
  }).join('\n\n');
  expect(blocking, `${stateLabel}: Axe blocking violations\n${summary}`).toEqual([]);
}

async function auditGeometry(page: Page): Promise<GeometryAudit> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const issues: string[] = [];
    const tolerance = 2;

    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    if (documentWidth > width + tolerance) {
      issues.push(`document horizontal overflow: ${documentWidth}px > ${width}px`);
    }
    if (bodyWidth > width + tolerance) {
      issues.push(`body horizontal overflow: ${bodyWidth}px > ${width}px`);
    }

    const visible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };

    const describe = (element: Element): string => {
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList).slice(0, 3).map(name => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    const assertInsideViewport = (element: HTMLElement): void => {
      const rect = element.getBoundingClientRect();
      if (rect.left < -tolerance || rect.right > width + tolerance
        || rect.top < -tolerance || rect.bottom > height + tolerance) {
        issues.push(`${describe(element)} outside viewport: `
          + `${Math.round(rect.left)},${Math.round(rect.top)} → `
          + `${Math.round(rect.right)},${Math.round(rect.bottom)} in ${width}x${height}`);
      }
    };

    const gameContainer = document.querySelector<HTMLElement>('.game-container');
    if (gameContainer && visible(gameContainer)) {
      assertInsideViewport(gameContainer);
      if (document.documentElement.scrollHeight > height + tolerance) {
        issues.push(`simulator global vertical overflow: ${document.documentElement.scrollHeight}px > ${height}px`);
      }
    }

    for (const selector of ['.canvas-zone', 'app-game-world canvas']) {
      for (const element of document.querySelectorAll(selector)) {
        if (!visible(element)) continue;
        assertInsideViewport(element);
      }
    }

    const overlays = Array.from(document.querySelectorAll<HTMLElement>(
      '[role="dialog"]:not([aria-hidden="true"]), [role="menu"]',
    )).filter(visible);
    for (const overlay of overlays) {
      assertInsideViewport(overlay);
      for (const control of overlay.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select')) {
        if (!visible(control)) continue;
        assertInsideViewport(control);

        const rect = control.getBoundingClientRect();
        const topElement = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        if (topElement && !control.contains(topElement) && !topElement.contains(control)) {
          issues.push(`${describe(control)} obscured at center by ${describe(topElement)}`);
        }
      }
    }

    return { viewport: { width, height }, issues };
  });
}
