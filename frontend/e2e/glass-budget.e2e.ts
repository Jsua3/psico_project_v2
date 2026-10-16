import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { visitEditorTabs } from './support/editor-tabs';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Presupuesto de vidrio (plan visual §2.4 y F9-3; RNF-05, RNF-005): como mucho 3 `backdrop-filter` VISIBLES a la vez
 * en el portal y 2 si hay un canvas a la vista. Se mide lo que el navegador pinta en cada pantalla del recorrido de los
 * cuatro roles y en cada pestaña del editor de casos, no las declaraciones del CSS (eso lo cuenta `ui:lint`).
 *
 * Cuenta el vidrio del elemento Y el de sus pseudoelementos (`::before` y `::after`): la receta pone el vidrio en
 * pseudoelementos («nunca vidrio sobre vidrio»), de modo que contar solo el elemento dejaba la barra fuera. Una capa con
 * opacidad 0 o sin caja no se pinta y no cuenta.
 *
 * LA BARRA DE VIDRIO QUEDA FUERA DEL PRESUPUESTO (decisión del usuario, 2026-10-16: «si son necesarias 3 cápsulas, 3; si
 * 4, 4»): usa las cápsulas que su receta necesite (una píldora en reposo, tres en «scroll» o «atención») y no se recorta
 * para caber. Sus capas se miden aparte y se informan en el mensaje; el presupuesto es de TODO LO DEMÁS.
 */
interface GlassCount {
  /** Capas de vidrio fuera de la barra: lo que cuenta contra el presupuesto. */
  layers: number;
  /** Capas de la barra de vidrio (`.cromo`): se informan, no cuentan. */
  barLayers: number;
  canvas: boolean;
  where: string[];
  /** Estado de la barra («scroll/escritorio»), para leer un fallo. */
  bar: string;
}

async function glass(page: Page): Promise<GlassCount> {
  return page.evaluate(() => {
    const where: string[] = [];
    let barLayers = 0;
    const filterOf = (style: CSSStyleDeclaration) =>
      style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const own = getComputedStyle(element);
      if (own.display === 'none' || own.visibility === 'hidden') continue;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const style = pseudo ? getComputedStyle(element, pseudo) : own;
        // Un pseudoelemento sin contenido no se genera y una capa transparente no se pinta: su filtro no cuenta.
        if (pseudo && (style.content === 'none' || style.content === 'normal' || style.display === 'none')) continue;
        if (Number.parseFloat(style.opacity) === 0) continue;
        const filter = filterOf(style);
        if (!filter || filter === 'none') continue;
        if (element.closest('.cromo')) {
          barLayers++;
          continue;
        }
        const classes = String(element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        where.push(`${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}${pseudo ?? ''}`);
      }
    }
    const canvas = Array.from(document.querySelectorAll('canvas')).some(item => item.getBoundingClientRect().width > 100);
    const bar = document.querySelector<HTMLElement>('.cromo');
    return { layers: where.length, barLayers, canvas, where, bar: bar ? `${bar.dataset['estado']}/${bar.dataset['ancho']}` : 'sin barra' };
  });
}

const budgetOf = (canvas: boolean) => (canvas ? 2 : 3);

function overBudget(key: string, found: GlassCount): string | null {
  const allowed = budgetOf(found.canvas);
  if (found.layers <= allowed) return null;
  return `${key}: ${found.layers} capas${found.canvas ? ' con canvas' : ''} (tope ${allowed}; la barra, ${found.barLayers} aparte, ${found.bar}) · ${found.where.join(', ')}`;
}

for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as const) {
  // req: RNF-05, RNF-005
  test(`@glass-budget ${role}: no más de 3 capas de vidrio visibles (2 con canvas), sin contar la barra`, async ({ page }) => {
    test.setTimeout(scaled(8 * 60_000));
    if (role !== 'publico') await loginAs(page, role as SignedRole);
    await page.setViewportSize({ width: 1440, height: 900 });
    const over: string[] = [];
    for (const screen of TOUR_SCREENS.filter(item => item.role === role)) {
      await openScreen(page, screen);
      const problem = overBudget(`${role}/${screen.id}`, await glass(page));
      if (problem) over.push(problem);
    }
    expect(over, 'pantallas por encima del presupuesto de vidrio').toEqual([]);
  });
}

// req: RNF-05, RNF-005
test('@glass-budget editor de casos: cada pestaña dentro del presupuesto de vidrio', async ({ page, request }) => {
  test.setTimeout(scaled(5 * 60_000));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const over: string[] = [];
  await visitEditorTabs(page, request, async tab => {
    const problem = overBudget(`editor · ${tab}`, await glass(page));
    if (problem) over.push(problem);
  });
  expect(over, 'pestañas por encima del presupuesto de vidrio').toEqual([]);
});

// Sondas de control: el contador tiene que ver el vidrio de un pseudoelemento (si no, todo lo anterior «pasaría» a
// ciegas), no contar una capa transparente y contar la barra aparte, sin que gaste el presupuesto.
test('@glass-budget la sonda cuenta el vidrio de los pseudoelementos, no el de capas transparentes y aparta el de la barra', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: `
    .sonda-vidrio, .sonda-vidrio-oculta, .sonda-barra { position: fixed; left: 20px; width: 80px; height: 80px; }
    .sonda-vidrio { top: 20px; } .sonda-vidrio-oculta { top: 120px; } .sonda-barra { top: 220px; }
    .sonda-vidrio::before, .sonda-vidrio-oculta::before, .sonda-barra__capsula::before { content: ''; position: absolute; inset: 0; backdrop-filter: blur(4px); }
    .sonda-vidrio-oculta::before { opacity: 0; }
    .sonda-barra__capsula { position: absolute; inset: 0; }` });
  await page.evaluate(() => {
    for (const name of ['sonda-vidrio', 'sonda-vidrio-oculta']) {
      const element = document.createElement('div');
      element.className = name;
      document.body.appendChild(element);
    }
    // Una «barra» de prueba con cuatro cápsulas de vidrio: la receta usa las que necesite y ninguna cuenta contra el tope.
    const bar = document.createElement('div');
    bar.className = 'cromo sonda-barra';
    for (let index = 0; index < 4; index++) {
      const capsule = document.createElement('div');
      capsule.className = 'sonda-barra__capsula';
      bar.appendChild(capsule);
    }
    document.body.appendChild(bar);
  });
  const baseline = await glass(page);
  expect(baseline.where, 'cuenta el ::before visible').toContain('div.sonda-vidrio::before');
  expect(baseline.where, 'no cuenta la capa transparente').not.toContain('div.sonda-vidrio-oculta::before');
  expect(baseline.where.some(item => item.includes('sonda-barra')), 'la barra no entra en el presupuesto').toBe(false);
  expect(baseline.barLayers, 'la barra se informa aparte (4 cápsulas de prueba como mínimo)').toBeGreaterThanOrEqual(4);
});
