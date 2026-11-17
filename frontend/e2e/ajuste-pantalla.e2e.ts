import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { PROFESOR, apiToken, send } from './support/case-fixtures';
import { createWorldInputDriver, exploreUntilNearby, loginAs, waitForWorldReady } from './support/siep-flow';

/**
 * Ajuste de la pantalla del juego al área de la página (bloque U1, V5; pedido del usuario: «la responsividad y la
 * adecuación de la interfaz con la pantalla está actualmente mal»). Recorre la matriz de áreas de página (lo que deja el
 * navegador, no la pantalla) al 100 % y al 125 % de zoom con un caso de textos largos generado con IA (las opciones más
 * largas que trae un caso hecho por NVIDIA), en el ensayo de la docente, que es el más estrecho: el panel de autora le
 * quita ~340 px al mundo. Falla si:
 *   - la página se desplaza;
 *   - una pieza fija del juego (ficha del objetivo, cabecera, pie, menús, cuadro) tiene barra propia (scrollHeight mayor
 *     que clientHeight en un contenedor desplazable);
 *   - una opción de la decisión queda fuera de la vista.
 * El zoom del navegador se imita con el área dividida entre el zoom y deviceScaleFactor igual al zoom.
 */
const DOC = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'caso-textos-largos.dsl.json'), 'utf-8'));
const AREAS: Array<[number, number]> = [
  [1280, 600], [1366, 650], [1536, 730], [1600, 780], [1920, 950], [1920, 1070], [1366, 768], [1920, 1080], [1920, 1200],
];
const ZOOMS = [1, 1.25];

async function desbordes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.scrollingElement!;
    if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1) out.push(`la página se desplaza (${doc.scrollWidth}x${doc.scrollHeight})`);
    const raiz = document.querySelector('.game-container') ?? document.body;
    const nombre = (el: Element) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 2).join('.')}`;
    // Último recurso (regla del usuario): solo con el cuadro ya compactado al máximo (nivel 3) la lista de fichas puede
    // desplazarse, y entonces la pista bajo ella nombra cada letra que queda abajo.
    const banda = document.querySelector<HTMLElement>('.dialogue-strip');
    const indice = document.querySelector<HTMLElement>('.strip-body[data-mas]')?.dataset['mas'] ?? '';
    const ocultas = Array.from(document.querySelectorAll<HTMLElement>('.choice-btn')).map((ficha, i) => {
      const r = ficha.getBoundingClientRect();
      const lista = ficha.closest('.choices')?.getBoundingClientRect();
      return r.bottom > innerHeight + 1 || (lista && (r.bottom > lista.bottom + 1 || r.top < lista.top - 1)) ? 'ABCD'[i] : '';
    }).filter(Boolean);
    const ultimoRecurso = banda?.dataset['compacto'] === '3' && ocultas.length > 0 && ocultas.every(l => indice.includes(l));
    raiz.querySelectorAll('*').forEach(el => {
      // El panel de autora es una herramienta de la docente con su propia lista desplazable, no una pieza del juego.
      if (el.closest('app-rehearsal-panel')) return;
      if (ultimoRecurso && el.classList.contains('choices')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || !/(auto|scroll)/.test(cs.overflowY)) return;
      if (el.scrollHeight > el.clientHeight + 1) out.push(`barra en ${nombre(el)} (${el.clientHeight} de ${el.scrollHeight} px)`);
    });
    if (!ultimoRecurso) ocultas.forEach(letra => out.push(`la opción ${letra} queda fuera de la vista`));
    return out;
  });
}

let caso = 0;
test.beforeAll(async ({ request }, testInfo) => {
  // Un solo importe por corrida: tras un fallo Playwright rehace el proceso y volvería a importar (el servidor frena los
  // importes seguidos con 429). El id queda en la carpeta de salida, que se vacía al empezar cada corrida.
  const memo = join(testInfo.project.outputDir, 'ajuste-pantalla-caso.json');
  if (existsSync(memo)) { caso = JSON.parse(readFileSync(memo, 'utf-8')).caso; return; }
  const token = await apiToken(request, PROFESOR);
  // Una versión propia por corrida: contra una pila viva, el mismo código y versión ya importados darían 409.
  const doc = { ...DOC, caso: { ...DOC.caso, version: `0.1.${Date.now() % 1_000_000}` } };
  const importado = await send(request, token, 'post', '/api/authoring/cases/import', doc, 'importar el caso de textos largos');
  caso = importado['caseVersionId'] as number;
  mkdirSync(testInfo.project.outputDir, { recursive: true });
  writeFileSync(memo, JSON.stringify({ caso }));
});

for (const [ancho, alto] of AREAS) {
  for (const zoom of ZOOMS) {
    test(`@ajuste-pantalla ${ancho}x${alto} al ${zoom * 100} %`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000);
      const contexto = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: Math.round(ancho / zoom), height: Math.round(alto / zoom) },
        deviceScaleFactor: zoom,
      });
      const page = await contexto.newPage();
      try {
        await loginAs(page, PROFESOR);
        await page.goto(`/portal/casos/${caso}/ensayo`);
        await waitForWorldReady(page);
        await page.waitForTimeout(1_200);
        expect(await desbordes(page), 'explorando').toEqual([]);

        // La primera persona de la sala (el panel de autora la lista como «hablar con …»), hasta sus opciones.
        const panel = await page.locator('app-rehearsal-panel').innerText();
        const nombre = /hablar con ([^\n]+)/i.exec(panel)?.[1]?.trim() ?? '';
        expect(nombre, 'la sala tiene a quién hablarle').not.toBe('');
        const quien = new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        await exploreUntilNearby(page, createWorldInputDriver(page, 'keyboard'), quien, 90_000);
        await page.keyboard.press('e');
        const dialogo = page.getByRole('dialog', { name: quien });
        await expect(dialogo).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(2_500);
        expect(await desbordes(page), 'conversación').toEqual([]);
        for (let i = 0; i < 12 && !(await page.locator('.choice-btn').first().isVisible()); i += 1) {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1_500);
        }
        await expect(page.locator('.choice-btn').first(), 'la conversación llega a sus opciones').toBeVisible();
        await page.waitForTimeout(1_500);
        // Con AJUSTE_CAPTURAS=<carpeta>, la decisión de cada tamaño queda en captura (para revisar a ojo).
        const carpeta = process.env['AJUSTE_CAPTURAS'];
        if (carpeta) await page.screenshot({ path: join(carpeta, `${ancho}x${alto}-${zoom * 100}-decision.png`) });
        expect(await desbordes(page), 'decisión').toEqual([]);

        // La consecuencia (los casos generados traen retroalimentación de hasta ~400 caracteres): tampoco se lee
        // desplazando; si no cabe, va en páginas con «N de M».
        await page.waitForTimeout(1_200); // la guarda contra la decisión accidental
        await page.locator('.choice-btn').first().click();
        const nota = page.getByRole('dialog', { name: /consecuencia/i });
        if (await nota.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)) {
          for (let i = 0; i < 8; i += 1) {
            await page.waitForTimeout(2_500);
            expect(await desbordes(page), `consecuencia, página ${i + 1}`).toEqual([]);
            const indicador = await page.locator('.placa-pagina').textContent().catch(() => null);
            if (!indicador || /^(\d+) de \1$/.test(indicador.trim())) break;
            await page.keyboard.press('Enter');
          }
        }
      } finally {
        await contexto.close();
      }
    });
  }
}
