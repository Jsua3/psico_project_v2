import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { PROFESOR, apiToken, send } from './support/case-fixtures';
import {
  esperarConsecuencia, createWorldInputDriver, enterWorld, exploreUntilNearby, loginAs, waitForWorldReady } from './support/siep-flow';

/**
 * Ajuste de la pantalla del juego al área de la página (bloque U1, V5; pedido del usuario: «la responsividad y la
 * adecuación de la interfaz con la pantalla está actualmente mal»). Recorre la matriz de áreas de página (lo que deja el
 * navegador, no la pantalla) al 100 % y al 125 % de zoom con un caso de textos largos generado con IA (las opciones más
 * largas que trae un caso hecho por NVIDIA), en el ensayo de la docente, que es el más estrecho: el panel de autora le
 * quita ~340 px al mundo. Falla si:
 *   - la página se desplaza;
 *   - una pieza fija del juego (ficha del objetivo, cabecera, pie, menús, cuadro) tiene barra propia (scrollHeight mayor
 *     que clientHeight en un contenedor desplazable);
 *   - una opción de la decisión queda fuera de la vista;
 *   - un menú (Ajustes, «Cómo se juega», bitácora, «Ir a…», plano, pausa) sale cortado de la ventana o se desplaza (V6);
 *   - el tramo (V7) no se cumple: letra fuera de la escala única, teclas del HUD fuera de su rango, la frase de la persona
 *     donde no toca o el retrato del kit recortado por su ventanilla;
 *   - el plano del caso de varias salas (SIM-VBG-002) sale cortado o se desplaza.
 * Además de los 9 tamaños al 100 % y al 125 %, un teléfono de 390 × 844 con dedo (tramo compacto), como estudiante: en el
 * teléfono el ensayo de la docente es su panel de autora y el mundo no se ve, así que se mide como lo usa quien juega.
 * El zoom del navegador se imita con el área dividida entre el zoom y deviceScaleFactor igual al zoom.
 */
const DOC = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'caso-textos-largos.dsl.json'), 'utf-8'));
const AREAS: Array<[number, number]> = [
  [1280, 600], [1366, 650], [1536, 730], [1600, 780], [1920, 950], [1920, 1070], [1366, 768], [1920, 1080], [1920, 1200],
];
const ZOOMS = [1, 1.25];
/** Cada tamaño de la matriz: área de la página y zoom (el teléfono va aparte, como estudiante). */
const TAMANOS = AREAS.flatMap(([ancho, alto]) => ZOOMS.map(zoom => ({ ancho, alto, zoom, dedo: false })));
/** El caso de varias salas (mundo por piezas): el único que trae plano y minimapa. */
const DOC_SALAS = JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-002.dsl.json'), 'utf-8'));

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
      if (cs.visibility === 'hidden') return;
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        out.push(`barra en ${nombre(el)} (${el.clientHeight} de ${el.scrollHeight} px)`);
      }
      // Tampoco de lado (V6): una tira fija que se desplaza a lo ancho también pide desplazar.
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        out.push(`barra de lado en ${nombre(el)} (${el.clientWidth} de ${el.scrollWidth} px)`);
      }
    });
    if (!ultimoRecurso) ocultas.forEach(letra => out.push(`la opción ${letra} queda fuera de la vista`));
    // Solapes (V6): ni la fila de «Volver al mapa» y «Salida segura» ni los botones del pie tapan el texto que se lee
    // ni la cuenta «N de M». No son desbordes: hay que mirar que los rectángulos no se crucen.
    const visibles = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter(el => getComputedStyle(el).visibility !== 'hidden')
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 1 && r.height > 1);
    const cruzan = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const tapa of visibles('.panel-head__row, .placa-pie .close-btn')) {
      for (const tapado of visibles('.dialogue-text, .placa-pagina')) {
        if (!tapa.el.contains(tapado.el) && !tapado.el.contains(tapa.el) && cruzan(tapa.r, tapado.r)) {
          out.push(`${nombre(tapa.el)} tapa ${nombre(tapado.el)}`);
        }
      }
    }
    return out;
  });
}

/**
 * Un solo importe por corrida: tras un fallo Playwright rehace el proceso del trabajador y volvería a importar (el servidor
 * frena los importes seguidos con 429). El id se guarda fuera de la carpeta de salida, en la carpeta temporal del sistema,
 * con la clave del proceso que corre la tanda (el padre de los trabajadores) y de la página: dura lo que dura la corrida.
 * Antes vivía en la carpeta de salida y lo escribía un `beforeAll` con el `request` del arnés: con la traza encendida, el
 * primer tamaño fallaba con ENOENT al guardar la traza de ese gancho en `.playwright-artifacts-*` (V6). Ahora el importe va
 * dentro de la prueba, con el `request` de su propio contexto, y la traza es la de la prueba.
 */
const casos = new Map<string, number>();
async function asegurarCaso(contexto: BrowserContext, baseURL: string, cual = 'textos-largos', fuente: Record<string, any> = DOC): Promise<number> {
  const enMemoria = casos.get(cual);
  if (enMemoria) return enMemoria;
  const clave = createHash('sha1').update(`${process.ppid}|${baseURL}|${cual}`).digest('hex').slice(0, 12);
  const memo = join(tmpdir(), `siep-ajuste-pantalla-${clave}.json`);
  if (existsSync(memo)) {
    const id = JSON.parse(readFileSync(memo, 'utf-8')).caso as number;
    casos.set(cual, id);
    return id;
  }
  const token = await apiToken(contexto.request, PROFESOR);
  // Una versión propia por corrida: contra una pila viva, el mismo código y versión ya importados darían 409.
  const doc = { ...fuente, caso: { ...fuente['caso'], version: `0.1.${Date.now() % 1_000_000}` } };
  const importado = await send(contexto.request, token, 'post', '/api/authoring/cases/import', doc, `importar el caso ${cual}`);
  const id = importado['caseVersionId'] as number;
  casos.set(cual, id);
  writeFileSync(memo, JSON.stringify({ caso: id }));
  return id;
}

/**
 * El tramo (V7, escala aprobada por el usuario; las mismas consultas que `pixel/tramos.ts`). Mide con una sonda la letra de
 * las placas (--pixel-tam) y la tecla del HUD, y mira la composición del HUD: en compacto la frase de la persona sale de la
 * barra pero sigue en el nombre del grupo, que se puede enfocar; en medio y amplio, la frase está en la barra.
 */
async function revisarTramo(page: Page, dedo: boolean): Promise<string[]> {
  return page.evaluate(conDedo => {
    const fuera: string[] = [];
    const ancho = innerWidth;
    const alto = innerHeight;
    const tramo = alto <= 700 || ancho <= 1100 ? 'compacto' : ancho >= 1700 && alto >= 1000 ? 'amplio' : 'medio';
    const raiz = document.querySelector('.game-container');
    if (!raiz) return ['no está el juego'];
    const sonda = document.createElement('div');
    sonda.style.cssText = 'position:absolute;visibility:hidden;font-size:var(--pixel-tam);width:var(--tecla-hud)';
    raiz.appendChild(sonda);
    const letra = parseFloat(getComputedStyle(sonda).fontSize);
    sonda.remove();
    const esperada = Math.min(16, Math.max(12, Math.min(0.00625 * alto + 9.25, 0.0047 * ancho + 7)));
    if (letra < 12 || letra > 16 || Math.abs(letra - esperada) > 0.5) fuera.push(`${tramo}: letra de ${letra} px (se esperaban ${esperada.toFixed(1)})`);
    const tecla = document.querySelector<HTMLElement>('.hud-action')?.getBoundingClientRect().width ?? 0;
    // Con cualquier puntero, de 44 a 48 px (la guarda de 44 px de BLOQUE-H y RNF-04 no se afloja).
    const [minimo, maximo] = [44, 48];
    if (tecla < minimo - 0.5 || tecla > maximo + 0.5) fuera.push(`${tramo}: tecla del HUD de ${tecla} px (de ${minimo} a ${maximo})`);
    const grupo = document.querySelector<HTMLElement>('.hud-persona');
    const frase = document.querySelector<HTMLElement>('.hud-persona-label');
    if (grupo && frase) {
      const texto = (frase.textContent ?? '').trim();
      if (!texto || !(grupo.getAttribute('aria-label') ?? '').includes(texto)) fuera.push(`${tramo}: la frase de la persona no está en el nombre del grupo`);
      const enLaBarra = getComputedStyle(frase).visibility !== 'hidden' && frase.getBoundingClientRect().width > 1;
      if (tramo === 'compacto') {
        if (enLaBarra) fuera.push('compacto: la frase de la persona sigue en la barra');
        if (grupo.tabIndex !== 0) fuera.push('compacto: el grupo de la persona no se puede enfocar para leer la frase');
      } else if (!enLaBarra) {
        fuera.push(`${tramo}: falta la frase de la persona en la barra`);
      }
    }
    return fuera;
  }, dedo);
}

/** En compacto, la frase aparece al pasar el cursor por la cara y queda dentro de la ventana. */
async function revisarFraseAlPasar(page: Page): Promise<string[]> {
  const grupo = page.locator('.hud-persona').first();
  if (!(await grupo.isVisible().catch(() => false))) return [];
  await grupo.hover();
  await page.waitForTimeout(200);
  const frase = page.locator('.hud-persona-label').first();
  const fuera = await frase.evaluate(el => getComputedStyle(el).visibility === 'hidden' ? ['la frase no aparece al pasar el cursor'] : []);
  await page.mouse.move(2, 2);
  return [...fuera, ...(fuera.length ? [] : await cortes(frase))];
}

/** El retrato del kit va a escala entera dentro de su ventanilla: nunca más grande que ella (salía recortado). */
async function revisarRetrato(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const caja = document.querySelector('.dialogue-strip .portrait');
    const kit = document.querySelector('.dialogue-strip .portrait-kit');
    if (!caja || !kit) return [];
    const c = caja.getBoundingClientRect();
    const k = kit.getBoundingClientRect();
    return k.width > c.width + 1 || k.height > c.height + 1
      ? [`el retrato del kit (${Math.round(k.width)} px) no cabe en su ventanilla (${Math.round(c.width)} px)`]
      : [];
  });
}

/**
 * Los menús y hojas del juego (V6, pedido del usuario: «ningún menú ni panel fijo queda cortado ni pide desplazar»). Cada
 * uno se abre desde el mundo, se mide con `desbordes` y con su rectángulo dentro de la ventana, y se cierra. Los que el caso
 * no trae (el plano, si hay una sola sala) se saltan.
 */
type Menu = { nombre: string; hoja: string; abrir: (page: Page) => Promise<boolean>; cerrar: (page: Page) => Promise<unknown> };
const siSeVe = async (boton: Locator) => (await boton.isVisible().catch(() => false)) && (await boton.click(), true);
const MENUS: Menu[] = [
  {
    nombre: 'ajustes', hoja: '#game-settings-menu',
    abrir: page => siSeVe(page.getByRole('button', { name: 'Abrir ajustes del juego' })),
    cerrar: page => page.getByRole('button', { name: 'Cerrar ajustes' }).click(),
  },
  {
    nombre: 'como-se-juega', hoja: '.help-screen',
    abrir: page => siSeVe(page.getByRole('button', { name: 'Abrir cómo se juega' })),
    cerrar: page => page.locator('[data-help-action="close"]').click(),
  },
  {
    nombre: 'bitacora', hoja: '.journal-modal--open',
    abrir: page => siSeVe(page.getByRole('button', { name: /^Abrir bitácora reflexiva/ })),
    cerrar: page => page.getByRole('button', { name: 'Continuar simulación' }).click(),
  },
  {
    nombre: 'ir-a', hoja: 'app-world-places-list .places',
    abrir: page => siSeVe(page.locator('[data-hud-places]')),
    cerrar: page => page.locator('.places__close').click(),
  },
  {
    nombre: 'plano', hoja: '.plano-dialogo',
    abrir: page => siSeVe(page.locator('[data-minimapa-abrir]')),
    cerrar: page => page.locator('[data-plano-cerrar]').click(),
  },
  {
    nombre: 'pausa', hoja: '.outcome--pause',
    abrir: async page => (await page.keyboard.press('Escape'), true),
    cerrar: page => page.getByRole('button', { name: 'Reanudar este intento' }).click(),
  },
];

/** Lo que de la hoja queda fuera de la ventana (cortado): cada borde, en píxeles. */
async function cortes(hoja: Locator): Promise<string[]> {
  return hoja.evaluate(el => {
    const r = el.getBoundingClientRect();
    const fuera: string[] = [];
    if (r.top < -1) fuera.push(`arriba ${Math.round(-r.top)} px`);
    if (r.left < -1) fuera.push(`izquierda ${Math.round(-r.left)} px`);
    if (r.bottom > innerHeight + 1) fuera.push(`abajo ${Math.round(r.bottom - innerHeight)} px`);
    if (r.right > innerWidth + 1) fuera.push(`derecha ${Math.round(r.right - innerWidth)} px`);
    return fuera;
  });
}

async function revisarMenus(page: Page, prefijo: string): Promise<void> {
  const carpeta = process.env['AJUSTE_CAPTURAS'];
  for (const menu of MENUS) {
    if (!(await menu.abrir(page))) continue;
    const hoja = page.locator(menu.hoja).first();
    const abierta = await hoja.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
    expect.soft(abierta, `el menú ${menu.nombre} se abre`).toBe(true);
    if (!abierta) continue;
    await page.waitForTimeout(500); // la bitácora entra con una transición de 220 ms
    if (carpeta) await page.screenshot({ path: join(carpeta, `${prefijo}-menu-${menu.nombre}.png`) });
    expect.soft(await desbordes(page), `menú ${menu.nombre}`).toEqual([]);
    expect.soft(await cortes(hoja), `menú ${menu.nombre}, dentro de la ventana`).toEqual([]);
    await menu.cerrar(page);
    await expect(hoja, `el menú ${menu.nombre} se cierra`).toBeHidden({ timeout: 5_000 });
    await page.waitForTimeout(300);
  }
}

for (const { ancho, alto, zoom, dedo } of TAMANOS) {
  {
    test(`@ajuste-pantalla ${ancho}x${alto} al ${zoom * 100} %${dedo ? ' con dedo' : ''}`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const contexto = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: Math.round(ancho / zoom), height: Math.round(alto / zoom) },
        deviceScaleFactor: zoom,
        hasTouch: dedo,
        isMobile: dedo,
      });
      const page = await contexto.newPage();
      try {
        const id = await asegurarCaso(contexto, String(testInfo.project.use.baseURL));
        await loginAs(page, PROFESOR);
        await page.goto(`/portal/casos/${id}/ensayo`);
        await waitForWorldReady(page);
        await page.waitForTimeout(1_200);
        expect(await desbordes(page), 'explorando').toEqual([]);
        expect.soft(await revisarTramo(page, dedo), 'tramo').toEqual([]);
        if (!dedo && (alto / zoom <= 700 || ancho / zoom <= 1100)) expect.soft(await revisarFraseAlPasar(page), 'frase de la persona').toEqual([]);
        await revisarMenus(page, `${ancho}x${alto}-${zoom * 100}`);

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
        expect.soft(await revisarRetrato(page), 'retrato en la decisión').toEqual([]);

        // La consecuencia (los casos generados traen retroalimentación de hasta ~400 caracteres): tampoco se lee
        // desplazando; si no cabe, va en páginas con «N de M».
        await page.waitForTimeout(1_200); // la guarda contra la decisión accidental
        await page.locator('.choice-btn').first().click();
        // V7: la reacción no se va sola; con su frase y «Continuar» (44 px) tampoco desborda.
        const franja = page.locator('app-reaction-director .reaction-strip');
        await expect(franja, 'la reacción de la persona aparece').toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(3_500);
        await expect(franja, 'la reacción no se va sola').toBeVisible();
        if (carpeta) await page.screenshot({ path: join(carpeta, `${ancho}x${alto}-${zoom * 100}-reaccion.png`) });
        expect(await desbordes(page), 'reacción con «Continuar»').toEqual([]);
        const continuar = page.locator('app-reaction-director button.reaction-continue');
        expect((await continuar.boundingBox())?.height ?? 0, '«Continuar» de la reacción mide al menos 44 px').toBeGreaterThanOrEqual(44);
        const nota = page.getByRole('dialog', { name: /consecuencia/i });
        if (await esperarConsecuencia(page, 20_000)) {
          for (let i = 0; i < 8; i += 1) {
            await page.waitForTimeout(2_500);
            expect(await desbordes(page), `consecuencia, página ${i + 1}`).toEqual([]);
            const indicador = await page.locator('.placa-pagina').textContent().catch(() => null);
            if (!indicador || /^(\d+) de \1$/.test(indicador.trim())) break;
            await page.keyboard.press('Enter');
          }
        }

        // El plano (V7: el caso de textos largos tiene una sola sala y no lo trae): el caso de varias salas, en su ensayo.
        const salas = await asegurarCaso(contexto, String(testInfo.project.use.baseURL), 'varias-salas', DOC_SALAS);
        await page.goto(`/portal/casos/${salas}/ensayo`);
        await waitForWorldReady(page);
        await page.waitForTimeout(1_200);
        const abrirPlano = page.locator('[data-minimapa-abrir]');
        await expect(abrirPlano, 'el caso de varias salas muestra el minimapa').toBeVisible({ timeout: 15_000 });
        await abrirPlano.click();
        const plano = page.locator('.plano-dialogo');
        await expect(plano).toBeVisible({ timeout: 5_000 });
        await page.waitForTimeout(500);
        const carpetaPlano = process.env['AJUSTE_CAPTURAS'];
        if (carpetaPlano) await page.screenshot({ path: join(carpetaPlano, `${ancho}x${alto}-${zoom * 100}-menu-plano.png`) });
        expect.soft(await desbordes(page), 'menú plano').toEqual([]);
        expect.soft(await cortes(plano), 'menú plano, dentro de la ventana').toEqual([]);
        await page.locator('[data-plano-cerrar]').click();
        await expect(plano).toBeHidden({ timeout: 5_000 });
      } finally {
        await contexto.close();
      }
    });
  }
}

// El teléfono (V7), con dedo y como estudiante en el primer caso de su catálogo: mundo, tramo compacto y menús.
test('@ajuste-pantalla 390x844 al 100 % con dedo, como estudiante', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const contexto = await browser.newContext({
    baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  });
  const page = await contexto.newPage();
  try {
    await enterWorld(page);
    await page.waitForTimeout(1_200);
    expect(await desbordes(page), 'explorando').toEqual([]);
    expect.soft(await revisarTramo(page, true), 'tramo').toEqual([]);
    await revisarMenus(page, '390x844-100');
    // El cuadro de diálogo en el teléfono (390 × 844, dedo) lo mide vertical-quality.e2e.ts (geometría y Axe); aquí, el mundo,
    // el tramo y los menús, que no dependen del caso que la pila ponga primero en el catálogo.
    const carpeta = process.env['AJUSTE_CAPTURAS'];
    if (carpeta) await page.screenshot({ path: join(carpeta, '390x844-100-explorar.png') });
  } finally {
    await contexto.close();
  }
});
