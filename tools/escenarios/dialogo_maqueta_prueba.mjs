// Recorre la maqueta del diálogo en Chromium sin cabeza: comprueba el recorrido y, con DIALOGO_FOTOS, saca capturas.
//   node tools/escenarios/dialogo_maqueta_prueba.mjs
//   DIALOGO_FOTOS=<carpeta> node tools/escenarios/dialogo_maqueta_prueba.mjs
// Usa el Playwright de frontend/node_modules del checkout principal y un Chromium en caché (variables abajo).
import { chromium } from 'file:///D:/Sua_Files/IdeaProjects/psico_project_v3/frontend/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.env.DIALOGO_URL || 'file:///D:/Sua_Files/IdeaProjects/psico_project_v3/.worktrees/i1/maqueta-visual/dialogo/maqueta.html';
const CHROME = process.env.E2E_CHROMIUM_PATH || 'C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const FOTOS = process.env.DIALOGO_FOTOS || '';
const SOLO = (process.env.DIALOGO_SOLO || '').split(',').filter(Boolean);
const R = { errores: [], pasos: {} };
const ok = (nombre, cond, detalle) => { R.pasos[nombre] = cond ? 'OK' : 'FALLA ' + JSON.stringify(detalle); };
const browser = await chromium.launch({ executablePath: CHROME });
process.on('exit', () => console.log(JSON.stringify(R, null, 1)));
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

async function abrir(viewport, opciones = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opciones.dpr || 1, reducedMotion: opciones.quieto ? 'reduce' : 'no-preference',
                                         hasTouch: !!opciones.tactil });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => R.errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') R.errores.push(m.text()); });
  await page.goto(URL + (opciones.pagina ? '' : '#solo'));
  await page.waitForFunction(() => window.__dialogo && window.__dialogo.listo, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const foto = async (page, nombre) => { if (FOTOS && (!SOLO.length || SOLO.some((s) => nombre.includes(s)))) await page.screenshot({ path: `${FOTOS}/${nombre}.png` }); };
const asentar = (page, ms = 900) => page.waitForTimeout(ms);
const ver = (page, que, opcion) => page.evaluate(([q, o]) => window.__dialogo.ver(q, o), [que, opcion ?? 0]);
const caja = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }, sel);

// ── recorrido con teclado a 1366 × 768 ──
{
  const page = await abrir({ width: 1366, height: 768 });
  ok('carga sin errores', R.errores.length === 0, R.errores);
  await page.evaluate(() => { const d = window.__dialogo; d.junto('abuela'); });
  await page.waitForFunction(() => !document.getElementById('burbuja').hidden, null, { timeout: 4000 }).catch(() => {});
  ok('al acercarse, la abuela comenta', await page.evaluate(() => !document.getElementById('burbuja').hidden && document.getElementById('burbuja-linea').textContent.length > 10));
  await page.evaluate(() => window.__dialogo.junto('psicologa-hospital'));
  await asentar(page, 300);
  await page.keyboard.press('e');
  await page.waitForFunction(() => !document.getElementById('dialogo').hidden);
  const antes = await caja(page, '#cuerpo');
  await asentar(page, 500);
  const durante = await caja(page, '#cuerpo');
  await page.keyboard.press('Enter');              // salta la línea 1
  const despues = await caja(page, '#cuerpo');
  ok('la placa no cambia de tamaño mientras se escribe', antes.join() === durante.join() && durante.join() === despues.join(), { antes, durante, despues });
  await page.keyboard.press('Enter');              // línea 2
  await page.keyboard.press('Enter');              // la completa: salen las fichas
  await page.waitForFunction(() => window.__dialogo.E.fase === 'opciones');
  ok('salen cuatro fichas A a D', await page.evaluate(() => [...document.querySelectorAll('#fichas .ficha .letra')].map((n) => n.textContent).join('')) === 'ABCD');
  const conFichas = await caja(page, '#cuerpo');
  ok('la placa no se mueve al salir las fichas', conFichas.join() === despues.join(), { despues, conFichas });
  await page.keyboard.press('Enter');              // Enter mantenido no debe elegir
  ok('Enter no elige sin foco en una ficha', await page.evaluate(() => window.__dialogo.E.fase) === 'opciones');
  await page.keyboard.press('ArrowDown');
  ok('la flecha da foco a la ficha A', await page.evaluate(() => document.activeElement && document.activeElement.id) === 'opcion-A');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  ok('las flechas recorren la rejilla', await page.evaluate(() => document.activeElement.id) === 'opcion-D');
  await asentar(page, 600);
  await foto(page, 'foco-1366');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dialogo.E.fase === 'reaccion', null, { timeout: 4000 });
  ok('elegir lleva a la reacción', true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dialogo.E.fase === 'nota', null, { timeout: 4000 });
  ok('después viene la nota de supervisión', await page.evaluate(() => document.getElementById('quien').textContent) === 'Supervisión clínica');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dialogo.E.esc === 1, null, { timeout: 4000 });
  ok('la nota lleva a la escena siguiente', true);
  await page.evaluate(() => window.__dialogo.ver('opciones'));
  await page.keyboard.press('b');
  await page.waitForFunction(() => window.__dialogo.E.fase === 'reaccion', null, { timeout: 4000 });
  ok('la letra elige y la persona cambia de estado', await page.evaluate(() => !document.getElementById('estado').hidden && document.getElementById('estado-texto').textContent.startsWith('Se muestra')));
  ok('sin errores en el recorrido', R.errores.length === 0, R.errores);
  await page.context().close();
}

// ── movimiento reducido: la línea aparece entera, sin máquina de escribir ──
{
  const page = await abrir({ width: 1366, height: 768 }, { quieto: true });
  await page.evaluate(() => { const d = window.__dialogo; d.junto('psicologa-hospital'); d.abrirDialogo('psicologa-hospital'); });
  ok('con movimiento reducido el texto sale de una vez', await page.evaluate(() => { const d = window.__dialogo; return d.T.total > 0 && d.T.n === d.T.total && !document.querySelector('#linea .falta'); }));
  await page.context().close();
}

// ── contraste de todo texto de la interfaz (4,5 a 1) ──
{
  const page = await abrir({ width: 1366, height: 768 });
  await ver(page, 'opciones');
  const pares = await page.evaluate(() => {
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const fondo = { '#quien': [27, 24, 38], '#linea': [33, 30, 46], '#estado-texto': [33, 30, 46], '.ficha-texto': [56, 51, 80], '#seguir-texto': [33, 30, 46], '.cinta': [33, 30, 46] };
    return Object.entries(fondo).map(([sel, f]) => { const n = document.querySelector(sel); const t = rgb(getComputedStyle(n).color); const a = lum(t), b = lum(f); return [sel, Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10]; });
  });
  ok('contraste de 4,5 a 1 en la interfaz', pares.every(([, r]) => r >= 4.5), pares);
  await page.context().close();
}

// ── capturas ──
if (FOTOS) {
  const tamanos = [['1366', { width: 1366, height: 768 }, {}], ['1920', { width: 1920, height: 1080 }, {}], ['390', { width: 390, height: 844 }, { dpr: 3, tactil: true }]];
  for (const [nombre, viewport, extra] of tamanos) {
    const page = await abrir(viewport, extra);
    for (const modo of ['nueva', 'hoy']) {
      await page.evaluate((m) => window.__dialogo.modo(m), modo);
      await page.evaluate(() => { window.__dialogo.iniciarEscena(0); });
      await ver(page, 'comentario'); await asentar(page); await foto(page, `${nombre}-${modo}-1-comentario`);
      await ver(page, 'habla'); await asentar(page, 1500); await foto(page, `${nombre}-${modo}-2-habla`);
      await ver(page, 'opciones'); await asentar(page); await foto(page, `${nombre}-${modo}-3-opciones`);
      await page.evaluate(() => window.__dialogo.largoTexto('largo')); await asentar(page); await foto(page, `${nombre}-${modo}-4-opciones-largas`);
      await page.evaluate(() => window.__dialogo.largoTexto('corto'));
      if (modo === 'nueva') { await page.evaluate(() => window.__dialogo.verEstados()); await asentar(page, 400); await foto(page, `${nombre}-${modo}-4b-estados`); }
      await ver(page, 'reaccion', 3); await asentar(page); await foto(page, `${nombre}-${modo}-5-reaccion`);
      await ver(page, 'nota', 3); await asentar(page); await foto(page, `${nombre}-${modo}-6-nota`);
      await page.evaluate(() => { window.__dialogo.iniciarEscena(1); });
      await ver(page, 'habla'); await page.evaluate(() => window.__dialogo.completar()); await asentar(page, 400); await foto(page, `${nombre}-${modo}-7-abuela-habla`);
      await ver(page, 'opciones'); await asentar(page); await foto(page, `${nombre}-${modo}-8-abuela-opciones`);
      await ver(page, 'reaccion', 0); await asentar(page); await foto(page, `${nombre}-${modo}-9-abuela-reaccion`);
    }
    await page.evaluate(() => { window.__dialogo.modo('nueva'); window.__dialogo.momento('dia'); window.__dialogo.iniciarEscena(0); });
    await ver(page, 'opciones'); await asentar(page); await foto(page, `${nombre}-nueva-dia-3-opciones`);
    await page.evaluate(() => { window.__dialogo.iniciarEscena(1); });
    await ver(page, 'reaccion', 0); await asentar(page); await foto(page, `${nombre}-nueva-dia-9-abuela-reaccion`);
    await page.context().close();
  }
  const page = await abrir({ width: 1366, height: 900 }, { pagina: true });
  await asentar(page); await foto(page, 'pagina-1366');
  await page.context().close();
}

await browser.close();
