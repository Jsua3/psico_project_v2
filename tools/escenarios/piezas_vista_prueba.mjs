// Recorre la vista previa de las salas por piezas en Chromium sin cabeza y dice qué pasa y qué falla.
//   node tools/escenarios/piezas_vista_prueba.mjs
// Usa el Playwright de frontend/node_modules del checkout principal y un Chromium en caché (variables abajo).
import { chromium } from 'file:///D:/Sua_Files/IdeaProjects/psico_project_v3/frontend/node_modules/playwright/index.mjs';

const URL = process.env.VISTA_URL || 'file:///D:/Sua_Files/IdeaProjects/psico_project_v3/.worktrees/p1/maqueta-visual/piezas/vista.html';
const CHROME = process.env.E2E_CHROMIUM_PATH || 'C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const FOTOS = process.env.VISTA_FOTOS || '';
const R = { errores: [], pasos: {} };
const ok = (nombre, cond, detalle) => { R.pasos[nombre] = cond ? 'OK' : 'FALLA ' + JSON.stringify(detalle); };
const browser = await chromium.launch({ executablePath: CHROME });
process.on('exit', () => console.log(JSON.stringify(R, null, 1)));

async function abrir(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => R.errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') R.errores.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__salas && document.getElementById('carga').hidden, null, { timeout: 20000 });
  return page;
}

const estado = (page) => page.evaluate(() => {
  const s = window.__salas, a = document.getElementById('aviso');
  return { sala: s.E.sala, x: Math.round(s.E.x), y: Math.round(s.E.y), vista: s.E.vista, activa: s.E.activa && s.E.activa.id,
           aviso: !a.hidden, texto: document.getElementById('aviso-texto').textContent, momento: s.E.momento };
});

const puerta = (page, sala, id) => page.evaluate(([sala, id]) => window.__salas.D.salas[sala].sprites.find((x) => x.id === id).puerta, [sala, id]);

async function tocar(page, x, y) {
  const p = await page.evaluate(([x, y]) => {
    const s = window.__salas, c = document.getElementById('lienzo'), r = c.getBoundingClientRect();
    return { px: r.left + (x - s.E.camX) / c.width * r.width, py: r.top + y / c.height * r.height, w: r.width, left: r.left };
  }, [x, y]);
  await page.mouse.click(Math.max(p.left + 2, Math.min(p.left + p.w - 2, p.px)), p.py);
}

async function caminarA(page, x, y) {
  for (let n = 0; n < 14; n++) {
    await tocar(page, x, y);
    try {
      await page.waitForFunction(([x, y]) => Math.hypot(window.__salas.E.x - x, window.__salas.E.y - y) < 6, [x, y], { timeout: 2500 });
      return true;
    } catch (e) { /* la cámara se movió: vuelve a tocar */ }
  }
  return false;
}

function muestrear(page, id, ms) {
  return page.evaluate(([id, ms]) => new Promise((listo) => {
    const vistos = [], t0 = performance.now();
    (function paso() {
      const v = Math.round(window.__salas.E.puertas[id] || 0);
      if (vistos[vistos.length - 1] !== v) vistos.push(v);
      if (performance.now() - t0 > ms) listo(vistos); else requestAnimationFrame(paso);
    })();
  }), [id, ms]);
}

async function cruzar(page, sala, id, conTecla = true) {
  const p = await puerta(page, sala, id);
  const llego = await caminarA(page, p.llegada[0], p.llegada[1]);
  const antes = await estado(page);
  if (conTecla) await page.keyboard.press('e'); else await page.click('#aviso', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  const despues = await estado(page);
  const par = await puerta(page, p.hacia, p.par);
  return { llego, antes, despues, esperado: { sala: p.hacia, x: par.llegada[0], y: par.llegada[1], muro: par.muro }, etiqueta: p.etiqueta };
}

const cruzoBien = (c) => c.llego && c.antes.aviso && c.antes.texto === c.etiqueta && c.despues.sala === c.esperado.sala &&
  Math.abs(c.despues.x - c.esperado.x) <= 1 && Math.abs(c.despues.y - c.esperado.y) <= 1;

// ── escritorio ──
let page = await abrir({ width: 1280, height: 900 });
R.inicio = await estado(page);
R.alcance = await page.evaluate(() => {
  const s = window.__salas, fallas = [], guardada = s.E.sala;
  for (const id of s.D.orden) {
    s.E.sala = id;
    const S = s.D.salas[id], visto = new Set(), q = (v) => Math.round(v / 8) * 8;
    if (!s.libre(S.entrada[0], S.entrada[1])) fallas.push(id + ': la entrada cae en un mueble');
    const cola = [[q(S.entrada[0]), q(S.entrada[1])]];
    visto.add(cola[0].join());
    while (cola.length) {
      const [x, y] = cola.pop();
      for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const n = [x + dx, y + dy];
        if (!visto.has(n.join()) && s.libre(n[0], n[1])) { visto.add(n.join()); cola.push(n); }
      }
    }
    for (const sp of S.sprites) {
      if (!sp.puerta) continue;
      const [px, py] = sp.puerta.llegada;
      if (!s.libre(px, py)) { fallas.push(id + '/' + sp.id + ': la llegada cae en un mueble o fuera de la zona'); continue; }
      let cerca = false;
      for (const k of visto) {
        const [x, y] = k.split(',').map(Number);
        if (Math.hypot(x - px, y - py) <= 12) { cerca = true; break; }
      }
      if (!cerca) fallas.push(id + '/' + sp.id + ': no se alcanza desde la entrada');
    }
  }
  s.E.sala = guardada;
  return fallas;
});

// 1. Al acercarse, la puerta pasa por sus cuatro cuadros y aparece el aviso con el destino.
const p1 = await puerta(page, 'entrada-urgencias', 'a-espera');
const serie = muestrear(page, 'a-espera', 2600);
await tocar(page, p1.llegada[0], p1.llegada[1]);
const cuadros = await serie;
await caminarA(page, p1.llegada[0], p1.llegada[1]);
let e = await estado(page);
ok('1 abre en cuatro cuadros', JSON.stringify(cuadros) === '[0,1,2,3]', cuadros);
ok('1 aviso con el destino', e.aviso && e.texto === p1.etiqueta && e.activa === 'a-espera', e);

// 2. Al alejarse se cierra.
const cierre = muestrear(page, 'a-espera', 2600);
await tocar(page, 600, 440);
const cuadrosCierre = await cierre;
e = await estado(page);
ok('2 se cierra al alejarse', JSON.stringify(cuadrosCierre) === '[3,2,1,0]' && !e.aviso, { cuadrosCierre, aviso: e.aviso });

// 3. Con E cambia de sala y aparece en la puerta del otro lado.
let c = await cruzar(page, 'entrada-urgencias', 'a-espera');
ok('3 E cruza por la puerta del fondo', cruzoBien(c) && c.esperado.muro === 'camara', c);

// 4. Lado de la cámara y laterales.
c = await cruzar(page, 'sala-espera', 'a-entrada');
ok('4 E cruza por el lado de la camara', cruzoBien(c) && c.esperado.muro === 'fondo', c);
c = await cruzar(page, 'entrada-urgencias', 'a-pasillo');
ok('4 E cruza por la puerta lateral izquierda', cruzoBien(c) && c.esperado.muro === 'derecha', c);
c = await cruzar(page, 'pasillo', 'a-enfermeria');
ok('4 E cruza por el paso lateral del pasillo', cruzoBien(c) && c.esperado.muro === 'derecha', c);
c = await cruzar(page, 'estacion-enfermeria', 'a-pasillo');
ok('4 vuelve por la puerta lateral derecha', cruzoBien(c) && c.esperado.muro === 'izquierda', c);
c = await cruzar(page, 'pasillo', 'a-espera');
ok('4 cruza por la camara del pasillo ancho', cruzoBien(c) && c.esperado.muro === 'fondo', c);

// 5. Día y noche sin recargar.
const brillo = () => page.evaluate(() => {
  const cv = document.getElementById('lienzo'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let t = 0;
  for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2];
  return t / (d.length / 4);
});
await page.evaluate(() => { window.__marca = 1; });
const dia = await brillo();
await page.click('#modo-noche');
await page.waitForTimeout(200);
const noche = await brillo();
e = await estado(page);
const sigue = await page.evaluate(() => window.__marca === 1 && document.getElementById('modo-noche').getAttribute('aria-pressed') === 'true');
ok('5 noche cambia la luz sin recargar', e.momento === 'noche' && noche < dia * 0.97 && sigue, { dia, noche, sigue });
if (FOTOS) await page.screenshot({ path: FOTOS + 'vista-noche.png' });
await page.click('#modo-dia');
await page.waitForTimeout(200);
ok('5 vuelve a dia', Math.abs(await brillo() - dia) < 0.5, {});

// El plano salta a todas las salas.
const visitas = [];
for (const id of await page.evaluate(() => window.__salas.D.orden)) {
  await page.click('#ir-' + id);
  await page.waitForTimeout(450);
  visitas.push((await estado(page)).sala === id);
}
const cuantas = await page.evaluate(() => Object.keys(window.__salas.D.salas).length);
ok('plano: salta a las ' + cuantas + ' salas', visitas.length === cuantas && cuantas >= 15 && visitas.every(Boolean), visitas);
await page.close();

// ── 6. pantalla angosta ──
page = await abrir({ width: 390, height: 800 });
const medidas = await page.evaluate(() => ({ desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                                             vw: document.getElementById('lienzo').width }));
ok('6 nada se desborda a 390 px', medidas.desborde <= 0, medidas);
const p6 = await puerta(page, 'entrada-urgencias', 'a-espera');
await caminarA(page, p6.llegada[0], p6.llegada[1]);
const cajas = await page.evaluate(() => {
  const a = document.getElementById('aviso'), r = a.getBoundingClientRect(), s = document.getElementById('escenario').getBoundingClientRect();
  return { boton: a.tagName === 'BUTTON' && !a.hidden, dentro: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1,
           alto: Math.round(r.height), ancho: Math.round(r.width), escena: Math.round(s.width) };
});
ok('6 el aviso es un boton y cabe en el escenario', cajas.boton && cajas.dentro, cajas);
if (FOTOS) await page.screenshot({ path: FOTOS + 'vista-angosta.png' });
c = await cruzar(page, 'entrada-urgencias', 'a-espera', false);
ok('6 tocar el aviso cruza la puerta', cruzoBien(c), c);
c = await cruzar(page, 'sala-espera', 'a-pasillo', false);
ok('6 cruza al pasillo ancho en pantalla angosta', cruzoBien(c), c);
await browser.close();
