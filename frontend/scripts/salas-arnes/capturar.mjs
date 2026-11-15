// Capturas del arnés de salas por piezas (contrato de calidad, «Cómo se comprueba»): cada sala del hospital de día y de noche
// a 1366 × 768 y 1920 × 1080, las escenas de la puerta (acercarse, cerrada con llave, cruzar y llegar) y la sala entera a
// escala real, sin nadie, para compararla con la composición de Python.
//
//   node scripts/salas-arnes/capturar.mjs [carpeta] [--solo=pasillo]
//
// Usa el Chromium de Playwright en caché con la GPU real (E2E_CHROMIUM_PATH y E2E_CHROMIUM_ARGS lo cambian).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

import { servir } from './servir.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, '..', '..', '..');
const CARPETA = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--'))
  ?? path.resolve(RAIZ_REPO, '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-p2'));
const SOLO = process.argv.find(a => a.startsWith('--solo='))?.slice('--solo='.length);
const PUERTO = 4381;
const CHROMIUM = process.env.E2E_CHROMIUM_PATH ?? 'C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const ARGS = (process.env.E2E_CHROMIUM_ARGS ?? '--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11 --enable-zero-copy')
  .split(' ').filter(Boolean);
const LUGAR = JSON.parse(readFileSync(path.join(RAIZ_REPO, 'biblioteca', 'piezas', 'lugares', 'hospital.json'), 'utf8'));

mkdirSync(CARPETA, { recursive: true });

/** Recorta un rectángulo de un PNG y lo agranda ×3 sin suavizar: para mirar el píxel. */
function aumentar(png, x, y, w, h, factor = 3) {
  const fuente = PNG.sync.read(png);
  x = Math.max(0, Math.min(fuente.width - w, x));
  y = Math.max(0, Math.min(fuente.height - h, y));
  const salida = new PNG({ width: w * factor, height: h * factor });
  for (let j = 0; j < h * factor; j++) {
    for (let i = 0; i < w * factor; i++) {
      const o = ((y + Math.floor(j / factor)) * fuente.width + x + Math.floor(i / factor)) * 4, d = (j * w * factor + i) * 4;
      fuente.data.copy(salida.data, d, o, o + 4);
    }
  }
  return PNG.sync.write(salida);
}

async function abrir(pagina, consulta) {
  await pagina.goto(`http://127.0.0.1:${PUERTO}/?${consulta}`);
  await pagina.waitForFunction(() => window.__arnesError || window.__arnes?.escena?.estado().listo, null, { timeout: 30000 });
  const error = await pagina.evaluate(() => window.__arnesError);
  if (error) throw new Error(`${consulta}: ${error}`);
  await pagina.waitForTimeout(400);
}

const estado = pagina => pagina.evaluate(() => window.__arnes.escena.estado());

async function guardar(pagina, nombre, opciones = {}) {
  const png = await pagina.screenshot(opciones);
  writeFileSync(path.join(CARPETA, `${nombre}.png`), png);
  return png;
}

const servidor = await servir(PUERTO);
const navegador = await chromium.launch({ executablePath: CHROMIUM, args: ARGS });
const hechas = [];
try {
  const salas = LUGAR.salas.filter(s => !SOLO || s.id === SOLO);

  // 1. Cada sala a 1366 × 768 y 1920 × 1080, de día y de noche, con quien juega en la entrada.
  for (const [ancho, alto] of [[1366, 768], [1920, 1080]]) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    for (const sala of salas) {
      for (const momento of ['dia', 'noche']) {
        await abrir(pagina, `sala=${sala.id}&momento=${momento}`);
        const png = await guardar(pagina, `${ancho}x${alto}-${sala.id}-${momento}`);
        if (ancho === 1366) {
          const e = await estado(pagina);
          const caja = await pagina.evaluate(() => {
            const cam = window.__arnes.escena.cameras.main;
            return { x: cam.worldView.x, y: cam.worldView.y, zoom: cam.zoom };
          });
          writeFileSync(path.join(CARPETA, `x3-${sala.id}-${momento}.png`),
            aumentar(png, Math.round((e.x - caja.x) * caja.zoom) - 200, Math.round((e.y - caja.y) * caja.zoom) - 150, 400, 200));
        }
        hechas.push(`${ancho}x${alto}-${sala.id}-${momento}`);
      }
    }
    await pagina.close();
  }

  // 2. La sala entera a escala real, sin nadie que juegue (para la hoja de contacto y la comparación con Python).
  for (const sala of salas) {
    const pagina = await navegador.newPage({ viewport: { width: sala.estructura.ancho, height: 528 } });
    for (const momento of ['dia', 'noche']) {
      await abrir(pagina, `sala=${sala.id}&momento=${momento}&z=1&x=${sala.estructura.ancho / 2}&y=600`);
      await pagina.evaluate(() => { document.getElementById('rotulo').hidden = true; });
      await guardar(pagina, `entera-${sala.id}-${momento}`);
    }
    await pagina.close();
  }

  // 3. La puerta: acercarse (se abre y aparece el aviso), cruzar con E y llegar a la puerta de regreso.
  if (!SOLO || SOLO === 'pasillo') {
    const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
    await abrir(pagina, 'sala=pasillo&momento=noche');
    const puertas = (await estado(pagina)).puertas;
    const escucha = puertas.find(p => p.hacia === 'sala-escucha') ?? puertas.find(p => p.muro === 'fondo');
    await pagina.evaluate(([x, y]) => window.__arnes.escena.colocar(x, y + 30, 3), escucha.umbral);
    await pagina.waitForTimeout(500);
    await guardar(pagina, 'puerta-1-cerca-pasillo-noche');
    const conAviso = await pagina.evaluate(() => !document.getElementById('aviso').hidden && document.getElementById('aviso').textContent);
    hechas.push(`aviso visible: ${JSON.stringify(conAviso)}`);
    await pagina.keyboard.press('e');
    await pagina.waitForTimeout(90);
    await guardar(pagina, 'puerta-2-cruzando');
    await pagina.waitForFunction(destino => {
      const e = window.__arnes.escena.estado();
      return e.listo && e.sala === destino && e.cruce === null;
    }, escucha.hacia, { timeout: 15000 });
    await pagina.waitForTimeout(300);
    await guardar(pagina, `puerta-3-llega-a-${escucha.hacia}`);
    hechas.push(`cruce: ${JSON.stringify(await estado(pagina).then(e => ({ sala: e.sala, x: e.x, y: e.y, activa: e.activa })))}`);

    // Cerrada con llave: no se abre, traquetea y el aviso dice qué falta.
    await abrir(pagina, `sala=pasillo&momento=noche&bloqueadas=${escucha.id}`);
    await pagina.evaluate(([x, y]) => window.__arnes.escena.colocar(x, y + 30, 3), escucha.umbral);
    await pagina.waitForTimeout(400);
    await pagina.keyboard.press('e');
    await pagina.waitForTimeout(20);
    await guardar(pagina, 'puerta-4-cerrada-con-llave');

    // Movimiento reducido: la puerta ya está abierta del todo al instante.
    await abrir(pagina, 'sala=pasillo&momento=noche&reducido=1');
    await pagina.evaluate(([x, y]) => window.__arnes.escena.colocar(x, y + 30, 3), escucha.umbral);
    await pagina.waitForTimeout(40);
    await guardar(pagina, 'puerta-5-movimiento-reducido');

    // De cerca (×3) para mirar el píxel de la puerta abierta y su cuña de luz.
    await abrir(pagina, 'sala=pasillo&momento=noche&z=3');
    await pagina.evaluate(([x, y]) => window.__arnes.escena.colocar(x, y + 30, 3), escucha.umbral);
    await pagina.waitForTimeout(500);
    await guardar(pagina, 'puerta-6-de-cerca-x3');
    await pagina.close();
  }

  // 4. De día, quien juega cruza el haz de una ventana: se ilumina y arroja sombra.
  if (!SOLO || SOLO === 'sala-espera') {
    const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
    await abrir(pagina, 'sala=sala-espera&momento=dia&z=3');
    const ventanas = await pagina.evaluate(() => window.__arnes.escena.sala.plan.sprites
      .filter(p => p.tipo === 'ventana' && p.muro === 'fondo').map(p => p.x + p.w / 2));
    const x = ventanas[0] ?? 720;
    await pagina.evaluate(v => window.__arnes.escena.colocar(v + 40, 330, 0), x);
    await pagina.waitForTimeout(400);
    await guardar(pagina, 'haz-1-en-la-luz-x3');
    await pagina.evaluate(v => window.__arnes.escena.colocar(v + 260, 330, 0), x);
    await pagina.waitForTimeout(400);
    await guardar(pagina, 'haz-2-en-penumbra-x3');
    await pagina.close();
  }
} finally {
  await navegador.close();
  servidor.close();
}
console.log(`${hechas.length} capturas o comprobaciones en ${CARPETA}`);
for (const h of hechas.filter(h => h.includes(':'))) console.log(h);
