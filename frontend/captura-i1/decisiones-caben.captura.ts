import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { assignCase, createExplorationCase, retireCase } from '../e2e/support/case-fixtures';
import type { AssignmentRecord, CaseFixture } from '../e2e/support/case-fixtures';
import { resetStudentConsent } from '../e2e/support/consent';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  createWorldInputDriver,
  finishCaseIntroduction,
  interactNearby,
  leaveBrief,
  loginStudent,
  reachNearby,
  startFreshAttempt,
  waitForWorldReady,
} from '../e2e/support/siep-flow';
import { scaled } from '../e2e/support/time-scale';

/**
 * Bloque I1: las 16 decisiones del caso insignia (SIM-VBG-002) caben en la pantalla, en el juego real, a 1366 × 768,
 * 1920 × 1080 y 390 px. El juego abre una conversación de verdad (cuadro sobre el mundo, pista y salida segura) y a ese
 * mismo panel se le da cada decisión tal como la arma el caso: quien habla, sus líneas y las fichas con el texto del
 * mapa, en el peor caso (herramienta que aún no se tiene y aviso de «puedes conocer más»). Para cada una comprueba:
 *  - el cuadro entero queda dentro de la pantalla, y nada de él (retrato, rótulo, cabecera, aviso, pistas) queda cortado;
 *  - A y B se ven enteras sin tocar nada, y cada ficha se puede ver entera desplazando solo la lista de fichas;
 *  - ninguna franja (cabecera, aviso, pista de teclado) tapa el rótulo de quien habla, ninguna pieza del cuadro se monta
 *    sobre otra y nada de la pantalla las tapa;
 *  - lo mismo con el aviso breve «hay otra forma de responder» en pantalla, que antes flotaba sobre las fichas;
 *  - la barra inferior del juego, oculta e inerte con el cuadro abierto, y de vuelta (visible y enfocable) al cerrarlo.
 *  - ninguna ficha visible sale a medias (la lista se acota a filas enteras y dice qué fichas quedan abajo), la pista de
 *    teclado va debajo de las fichas y, a 1920 x 1080, las fichas caben enteras sin desplazar.
 * Los estados salen de `tools/escenarios/decisiones_para_prueba.py`. Se corre con la pila aislada:
 *   SIEP_TEST_DB_PORT=5664 SIEP_E2E_API_PORT=8184 SIEP_E2E_WEB_PORT=4384 \
 *     node scripts/test-e2e.mjs --config=captura-i1/playwright.config.ts decisiones-caben
 * Deja las medidas y tres capturas por tamaño en `CAPTURA_DIR`.
 */
const DESTINO = process.env['CAPTURA_DIR'] ?? 'D:/Sua_Files/IdeaProjects/psico_project_v3/.superpowers/noche-2026-11-14/capturas-i1';
const TODOS = [
  { nombre: '1366', width: 1366, height: 768 },
  { nombre: '1920', width: 1920, height: 1080 },
  { nombre: '390', width: 390, height: 844 },
];
const PEDIDOS = (process.env['CAPTURA_TAMANOS'] ?? '1366,1920,390').split(',');
const TAMANOS = TODOS.filter(t => PEDIDOS.includes(t.nombre));
// Las que más piden: la de la herramienta con tres decisiones, la de cuatro decisiones y la ficha más larga.
const FOTOS = ['prueba-c1-sala-espera-abuela', 'prueba-c2-accion-tecnica-psicologa-hospital', 'prueba-c3-pasillo-sobreviviente'];

interface Estado { key: string; speakerName: string; choices: unknown[] }
const { decisiones } = JSON.parse(readFileSync(join(__dirname, 'decisiones-sim-vbg-002.json'), 'utf-8')) as { decisiones: Estado[] };

async function entrarAlCaso(page: Page, title: string): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await resetStudentConsent(page);
  await page.goto('/portal/simulador');
  const card = page.locator('.case-card').filter({ hasText: title });
  await expect(card).toBeVisible({ timeout: scaled(30_000) });
  await card.locator('.case-card__actions button').first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
  await leaveBrief(page);
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
  await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(30_000) });
  if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
  await expect(consent).toBeVisible({ timeout: scaled(30_000) });
  const intro = await acceptContentWarning(page, consent);
  const card2 = await finishCaseIntroduction(page, intro);
  await card2.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
}

/** Le da al panel del juego el estado de diálogo de una decisión (la misma señal que llena la respuesta del servidor). */
async function ponerDecision(page: Page, estado: Estado): Promise<void> {
  await page.evaluate((e) => {
    const ng = (window as unknown as { ng?: { getComponent(el: Element): unknown } }).ng;
    const anfitrion = document.querySelector('app-simulation-play');
    if (!ng || !anfitrion) throw new Error('Sin la API de depuración de Angular (ng serve en desarrollo) o sin el juego');
    (ng.getComponent(anfitrion) as { dialogue: { set(v: unknown): void } }).dialogue.set(e);
  }, estado);
}

/** Mide el cuadro y devuelve lo que no cumple (vacío si todo cabe). */
async function medir(page: Page): Promise<{ fallas: string[]; medidas: Record<string, unknown> }> {
  return page.evaluate(() => {
    type Caja = { top: number; bottom: number; left: number; right: number };
    const T = 0.5;
    const caja = (el: Element): Caja => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const dentro = (a: Caja, b: Caja) => a.top >= b.top - T && a.bottom <= b.bottom + T && a.left >= b.left - T && a.right <= b.right + T;
    const cruce = (a: Caja, b: Caja) => a.left < b.right - T && b.left < a.right - T && a.top < b.bottom - T && b.top < a.bottom - T;
    const corte = (a: Caja, b: Caja): Caja => ({ top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom), left: Math.max(a.left, b.left), right: Math.min(a.right, b.right) });
    const txt = (c: Caja) => `[${Math.round(c.left)},${Math.round(c.top)} → ${Math.round(c.right)},${Math.round(c.bottom)}]`;
    const oculto = (el: Element) => {
      const s = getComputedStyle(el);
      return el.getBoundingClientRect().height < 2 || s.display === 'none' || s.visibility === 'hidden' || s.clip === 'rect(0px, 0px, 0px, 0px)';
    };
    const fallas: string[] = [];
    const pantalla: Caja = { top: 0, left: 0, right: innerWidth, bottom: innerHeight };
    const anfitrion = document.querySelector('app-dialogue-panel.dialogue-cinematic');
    const tira = anfitrion?.querySelector('.dialogue-strip');
    if (!anfitrion || !tira) return { fallas: ['no hay cuadro de diálogo sobre el mundo'], medidas: {} };
    const cTira = caja(tira);
    if (!dentro(caja(anfitrion), pantalla)) fallas.push(`el cuadro sale de la pantalla ${txt(caja(anfitrion))}`);
    if (!dentro(cTira, pantalla)) fallas.push(`la banda sale de la pantalla ${txt(cTira)}`);
    const visible = corte(cTira, pantalla);
    // Lo que nunca se desplaza tiene que verse entero: retrato, rótulo, texto, cabecera, aviso, pistas.
    const fijos: Record<string, string> = {
      retrato: '.portrait', rotulo: '.speaker-name', placa: '.placa-cuerpo', cabecera: '.panel-head', volver: '.panel-back',
      salida: 'app-safe-exit-button', nota: '.panel-head__note', aviso: '.choices-notice', pista: 'app-scene-hint',
      teclado: '.keyboard-hint', columna: '.strip-body',
    };
    const medidas: Record<string, unknown> = { tira: txt(cTira) };
    for (const [nombre, sel] of Object.entries(fijos)) {
      const el = tira.querySelector(sel);
      if (!el || oculto(el)) continue;
      const c = caja(el);
      medidas[nombre] = txt(c);
      if (!dentro(c, visible)) fallas.push(`${nombre} queda cortado o fuera ${txt(c)} (visible ${txt(visible)})`);
    }
    // Ninguna franja tapa el rótulo de quien habla.
    const rotulo = tira.querySelector('.speaker-name');
    if (rotulo) {
      for (const sel of ['.panel-head', '.choices-notice', 'app-scene-hint', '.keyboard-hint', '.choices']) {
        const el = tira.querySelector(sel);
        if (el && !oculto(el) && cruce(caja(el), caja(rotulo))) fallas.push(`${sel} tapa el rótulo de quien habla`);
      }
    }
    // Las fichas: A y B enteras de entrada; cada una, entera desplazando solo su lista.
    const lista = tira.querySelector<HTMLElement>('.choices');
    if (!lista) return { fallas: [...fallas, 'no hay fichas'], medidas };
    const ventana = corte(caja(lista), visible);
    medidas['lista'] = `${txt(caja(lista))} desplazable ${lista.scrollHeight - lista.clientHeight}px`;
    medidas['tope'] = `${lista.style.maxHeight || 'sin tope'} | banda ${getComputedStyle(tira).height} de ${getComputedStyle(tira).maxHeight}`;
    if (new URLSearchParams(location.search).has('diagnostico') || (window as unknown as { __diag?: boolean }).__diag) {
      const ficha = lista.querySelector<HTMLElement>('.choice-btn');
      const tope = lista.style.maxHeight;
      const mas = lista.parentElement!.dataset['mas'];
      lista.style.maxHeight = '';
      delete lista.parentElement!.dataset['mas'];
      medidas['libre'] = `lista ${lista.clientHeight}/${lista.scrollHeight} banda ${tira.getBoundingClientRect().height}`;
      lista.style.maxHeight = tope;
      if (mas) lista.parentElement!.dataset['mas'] = mas;
      medidas['diag'] = `fichas ${Array.from(lista.querySelectorAll<HTMLElement>('.choice-btn')).map(f => `${f.offsetTop}+${f.offsetHeight}`).join(',')} | lista offTop ${lista.offsetTop} client ${lista.clientHeight} scroll ${lista.scrollHeight} | ficha padre ${ficha?.offsetParent?.className} lista padre ${(lista.offsetParent as HTMLElement | null)?.className}`;
    }
    const fichas = Array.from(lista.querySelectorAll<HTMLElement>('.choice-btn'));
    fichas.slice(0, 2).forEach((f, i) => {
      if (!dentro(caja(f), ventana)) fallas.push(`la ${'AB'[i]} no se ve entera sin desplazar ${txt(caja(f))} (lista ${txt(ventana)})`);
    });
    // Ninguna ficha visible sale a medias: o se ve entera o no se ve (la lista se acota a filas enteras).
    fichas.forEach((f, i) => {
      const c = caja(f);
      const asoma = Math.min(c.bottom, ventana.bottom) - Math.max(c.top, ventana.top);
      if (asoma > T && !dentro(c, ventana)) fallas.push(`la ficha ${'ABCDEF'[i]} se ve a medias ${txt(c)} (lista ${txt(ventana)})`);
    });
    // A 1920 x 1080 hay sitio para las fichas enteras de cada decisión: ahí la lista no se desplaza.
    if (innerWidth >= 1800 && innerHeight >= 1000 && lista.scrollHeight > lista.clientHeight + 1) {
      fallas.push(`a ${innerWidth} x ${innerHeight} la lista se desplaza aunque hay sitio (${lista.scrollHeight - lista.clientHeight}px)`);
    }
    // Si la lista se desplaza, bajo ella se dice qué fichas quedan abajo.
    if (lista.scrollHeight > lista.clientHeight + 1) {
      const senal = getComputedStyle(lista.parentElement!, '::after');
      if (senal.content === 'none' || senal.display === 'none') fallas.push('la lista se desplaza y no dice qué fichas quedan abajo');
      else medidas['senal'] = senal.content;
    }
    // La pista de teclado va debajo de las fichas, sin montarse sobre la lista.
    const teclado = tira.querySelector('.keyboard-hint');
    if (teclado && !oculto(teclado) && caja(teclado).top < caja(lista).bottom - T) {
      fallas.push(`la pista de teclado se monta sobre la lista ${txt(caja(teclado))} (lista ${txt(caja(lista))})`);
    }
    fichas.forEach((f, i) => {
      const antes = caja(f);
      if (antes.bottom > ventana.bottom) lista.scrollTop += antes.bottom - ventana.bottom + 1;
      if (antes.top < ventana.top) lista.scrollTop -= ventana.top - antes.top + 1;
      const c = caja(f);
      if (!dentro(c, ventana)) fallas.push(`la ficha ${'ABCDEF'[i]} no se puede ver entera ${txt(c)} (lista ${txt(ventana)})`);
      const cuerpo = f.querySelector<HTMLElement>('.choice-btn__body');
      if (cuerpo && cuerpo.scrollWidth > cuerpo.clientWidth + 1) fallas.push(`el texto de la ficha ${'ABCDEF'[i]} se corta a lo ancho`);
      // El texto (y el aviso de herramienta) dentro del marco de la ficha, no saliéndose por abajo sobre el canto.
      const borde = parseFloat(getComputedStyle(f).borderBottomWidth) || 0;
      if (cuerpo && caja(cuerpo).bottom > c.bottom - borde + 1) {
        fallas.push(`el texto de la ficha ${'ABCDEF'[i]} se sale de su marco por abajo ${txt(caja(cuerpo))} (ficha ${txt(c)})`);
      }
    });
    lista.scrollTop = 0;

    // Nada tapa a nada: las piezas del cuadro no se montan unas sobre otras, ningún aviso flota encima, y lo que hay en
    // cada pieza es la pieza misma (no otra capa de la pantalla).
    const sueltas = ['.speaker-name', '.portrait', '.placa-habla', '.panel-head__aviso', '.panel-head__note', '.panel-back',
      'app-safe-exit-button', '.choices-notice', 'app-scene-hint', '.keyboard-hint']
      .map(sel => tira.querySelector(sel)).filter((el): el is Element => !!el && !oculto(el));
    const piezas: Element[] = [...sueltas, ...fichas.filter(f => dentro(caja(f), ventana))];
    const nombre = (el: Element) => el.classList[0] ?? el.tagName.toLowerCase();
    for (let i = 0; i < piezas.length; i++) {
      for (let j = i + 1; j < piezas.length; j++) {
        const [a, b] = [piezas[i], piezas[j]];
        if (a.contains(b) || b.contains(a)) continue;
        if (cruce(caja(a), caja(b))) fallas.push(`${nombre(a)} y ${nombre(b)} se montan ${txt(caja(a))} ${txt(caja(b))}`);
      }
    }
    for (const el of piezas) {
      const c = caja(el);
      const m = Math.min(5, (c.right - c.left) / 4, (c.bottom - c.top) / 4);
      const puntos = [[(c.left + c.right) / 2, (c.top + c.bottom) / 2], [c.left + m, c.top + m], [c.right - m, c.top + m],
        [c.left + m, c.bottom - m], [c.right - m, c.bottom - m]];
      for (const [x, y] of puntos) {
        const encima = document.elementFromPoint(x, y);
        // La pestaña del nombre tapa a propósito el canto de la placa (un punto de mundo).
        if (encima && !el.contains(encima) && !encima.closest('.speaker-name')) {
          fallas.push(`${nombre(encima)} tapa ${nombre(el)} en (${Math.round(x)}, ${Math.round(y)})`);
          break;
        }
      }
    }
    // La barra inferior del juego (herramientas, «Salida segura») no queda debajo del cuadro: oculta e inerte.
    const barra = document.querySelector('footer.bottom-zone');
    if (barra && (getComputedStyle(barra).visibility !== 'hidden' || !barra.hasAttribute('inert') || barra.getAttribute('aria-hidden') !== 'true')) {
      fallas.push('la barra inferior sigue visible o activa con el cuadro abierto');
    }
    // Los avisos sueltos de la pantalla no pasan por el sitio del cuadro (no reciben el puntero: se miden aparte).
    for (const aviso of Array.from(document.querySelectorAll('.soft-notice, .pausing-notice, .room-banner'))) {
      if (!oculto(aviso) && cruce(caja(aviso), cTira)) fallas.push(`${nombre(aviso)} flota encima del cuadro ${txt(caja(aviso))}`);
    }
    return { fallas, medidas };
  });
}

/** Un aviso breve de la pantalla (VD-29) con la decisión abierta: el que salía encima de las opciones. */
async function ponerAvisoBreve(page: Page, texto: string): Promise<void> {
  await page.evaluate((t) => {
    const ng = (window as unknown as { ng: { getComponent(el: Element): unknown } }).ng;
    (ng.getComponent(document.querySelector('app-simulation-play')!) as { softNotice: { set(v: string): void } }).softNotice.set(t);
  }, texto);
}

for (const tamano of TAMANOS) {
  test.describe(`decisiones-${tamano.nombre}`, () => {
    test.use({ viewport: { width: tamano.width, height: tamano.height } });

    test(`las 16 decisiones del caso caben en la pantalla (${tamano.nombre})`, async ({ page, request }) => {
      test.setTimeout(scaled(360_000));
      expect(decisiones).toHaveLength(16);
      let fixture: CaseFixture | undefined;
      const records: AssignmentRecord[] = [];
      const informe: Record<string, unknown> = {};
      const todas: string[] = [];
      try {
        fixture = await createExplorationCase(request);
        records.push(await assignCase(request, fixture.caseVersionId));
        const input = createWorldInputDriver(page, 'keyboard');
        await entrarAlCaso(page, fixture.title);
        // Una conversación de verdad: el juego monta el cuadro sobre el mundo con su pista y su salida segura.
        await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], /laura/i);
        await interactNearby(page, /laura/i, /\/interactions\/laura$/);
        await expect(page.getByRole('dialog', { name: /laura/i })).toBeVisible({ timeout: scaled(30_000) });

        if (process.env['CAPTURA_DIAG']) await page.evaluate(() => { (window as unknown as { __diag?: boolean }).__diag = true; });
        for (const estado of decisiones) {
          await ponerDecision(page, estado);
          const nombre = new RegExp(estado.speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          const cuadro = await advanceDialogueToChoices(page, nombre);
          await expect(cuadro.locator('.choice-btn')).toHaveCount(estado.choices.length);
          await page.waitForTimeout(450); // entrada escalonada de las fichas
          const { fallas, medidas } = await medir(page);
          informe[estado.key] = { fallas, medidas };
          todas.push(...fallas.map(f => `${estado.key}: ${f}`));
          if (FOTOS.includes(estado.key)) {
            await page.screenshot({ path: `${DESTINO}/decisiones-caben-${tamano.nombre}-${estado.key.replace(/^prueba-/, '')}.png` });
          }
          // Lo mismo con el aviso de «hay otra forma de responder» en pantalla (antes flotaba sobre la A y la C).
          await ponerAvisoBreve(page, 'Ahora conoces algo más: hay otra forma de responder.');
          await page.waitForTimeout(150);
          const conAviso = await medir(page);
          informe[`${estado.key} (con aviso breve)`] = conAviso;
          todas.push(...conAviso.fallas.map(f => `${estado.key} con aviso breve: ${f}`));
          if (estado.key === FOTOS[0]) {
            await page.screenshot({ path: `${DESTINO}/decisiones-caben-${tamano.nombre}-con-aviso-breve.png` });
          }
          await ponerAvisoBreve(page, '');
        }
        // Las placas-botón de la cabecera, recortadas, en reposo, sobre y pulsadas (para mirarlas a x1 y x3). Pulsar es bajar
        // el botón y soltarlo fuera: no se dispara nada.
        const cabeza = page.locator('app-dialogue-panel.dialogue-cinematic .panel-head');
        const pista = page.locator('app-dialogue-panel.dialogue-cinematic app-scene-hint');
        const recorte = async (estado: string) => {
          const a = (await cabeza.boundingBox())!;
          const b = (await pista.boundingBox()) ?? a;
          const x = Math.max(0, Math.min(a.x, b.x) - 12);
          const y = Math.max(0, Math.min(a.y, b.y) - 12);
          const ancho = Math.min(tamano.width - x, Math.max(a.x + a.width, b.x + b.width) - x + 12);
          const alto = Math.min(tamano.height - y, Math.max(a.y + a.height, b.y + b.height) - y + 12);
          await page.screenshot({ path: `${DESTINO}/placas-${tamano.nombre}-${estado}.png`, clip: { x, y, width: ancho, height: alto } });
        };
        await page.mouse.move(2, 2);
        await recorte('reposo');
        for (const [nombre, selector] of [['salida', '.panel-head__exit button'], ['volver', '.panel-back'], ['pista', 'app-scene-hint button']]) {
          const boton = page.locator(`app-dialogue-panel.dialogue-cinematic ${selector}`).first();
          await boton.hover();
          await recorte(`sobre-${nombre}`);
          if (nombre !== 'pista') {
            await page.mouse.down();
            await recorte(`pulsada-${nombre}`);
            await page.mouse.move(2, 2);
            await page.mouse.up();
          }
        }
        // Al cerrar el cuadro, la barra inferior vuelve: visible, activa y con «Salida segura» enfocable.
        await page.locator('app-dialogue-panel.dialogue-cinematic .panel-back').click();
        await expect(page.locator('app-dialogue-panel.dialogue-cinematic')).toHaveCount(0);
        const pie = await page.evaluate(() => {
          const barra = document.querySelector('footer.bottom-zone')!;
          const salida = barra.querySelector<HTMLElement>('app-safe-exit-button button');
          salida?.focus();
          return { visible: getComputedStyle(barra).visibility, inerte: barra.hasAttribute('inert'), enfocada: !!salida && document.activeElement === salida };
        });
        expect(pie).toEqual({ visible: 'visible', inerte: false, enfocada: true });
      } finally {
        writeFileSync(`${DESTINO}/decisiones-caben-${tamano.nombre}.json`, JSON.stringify(informe, null, 1));
        if (fixture) await retireCase(request, fixture.caseVersionId, records);
      }
      expect(todas).toEqual([]);
    });
  });
}
