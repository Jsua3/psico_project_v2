import path from 'node:path';

import { expect, test } from '@playwright/test';

import { crearCaso, esperarPantalla, rutas } from './ayudas';

// Playwright carga las pruebas como CommonJS (el paquete no es "type": "module").
const AXE = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

/** Palabras que el docente nunca debe ver (jerga técnica). */
const PROHIBIDAS = /\b(nodo|nodos|arista|aristas|DAG|grafo|spawn|ID|IDs|clave|claves|hex|prompt|metadata)\b/i;

test('ninguna pantalla tiene problemas de accesibilidad graves ni jerga técnica', async ({ page }) => {
  await crearCaso(page);
  const problemas: string[] = [];
  for (const ruta of await rutas(page)) {
    await page.goto(ruta);
    await esperarPantalla(page);
    await page.addScriptTag({ path: AXE });
    const violaciones = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      // Las piezas del dibujo de la sala se tapan entre sí (un vaso sobre la mesa). La lista
      // «Cosas en la sala» hace lo mismo con filas grandes: es la excepción de «control
      // equivalente» de WCAG 2.5.8, así que el tamaño de blanco no se exige a esas piezas.
      const deDibujo = (n: { target: string[] }) => n.target.join(' ').includes('data-elemento');
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ ...v, nodes: v.id === 'target-size' ? v.nodes.filter((n) => !deDibujo(n)) : v.nodes }))
        .filter((v) => v.nodes.length > 0)
        .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    for (const v of violaciones) problemas.push(`${ruta}: ${v}`);
    const texto = (await page.locator('body').textContent()) ?? '';
    const jerga = texto.match(PROHIBIDAS);
    if (jerga) problemas.push(`${ruta}: palabra prohibida «${jerga[0]}»`);
  }
  expect(problemas).toEqual([]);
});
