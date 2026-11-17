// Saca las capturas de la maqueta a escala real (modo solo=1) y comprueba lo que se puede medir: nada se sale de la pantalla,
// nada interactivo baja de 44 px, piezas del HUD que se montan y errores de consola. Uso:
//   node capturar.mjs <carpeta-de-salida> [estado,estado...] [tam,tam...] [B|A]
// Usa el Playwright del checkout principal y el Chromium en caché (como la maqueta de I1).
import { chromium } from 'file:///D:/Sua_Files/IdeaProjects/psico_project_v3/frontend/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const CHROME = process.env.E2E_CHROMIUM_PATH || 'C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const salida = process.argv[2];
const estados = (process.argv[3] || 'explorando,llegada,puerta,aviso,conversacion,decision,pista,sinpista,pausa,capitulo,ira').split(',');
const tams = (process.argv[4] || '1366,1920,390').split(',');
const variante = process.argv[5] || 'B';
const TAM = { 1366: [1366, 768], 1920: [1920, 1080], 390: [390, 844] };
mkdirSync(salida, { recursive: true });
const url = pathToFileURL(path.join(AQUI, 'maqueta.html')).href;

const browser = await chromium.launch({ executablePath: CHROME });
const informe = [];
for (const tam of tams) {
  const [w, h] = TAM[tam];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push(String(e)));
  for (const estado of estados) {
    await page.goto(`${url}?solo=1&estado=${estado}&tam=${tam}&var=${variante}&quieto=1`);
    await page.waitForSelector('body[data-listo="1"]');
    await page.waitForTimeout(150);
    const datos = await page.evaluate(() => {
      const raiz = document.getElementById('solo'); const R = raiz.getBoundingClientRect();
      const fuera = []; const chicos = [];
      for (const el of raiz.querySelectorAll('button, [role="button"], a')) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (r.left < R.left - 0.5 || r.top < R.top - 0.5 || r.right > R.right + 0.5 || r.bottom > R.bottom + 0.5) fuera.push(el.textContent.trim().slice(0, 40) || el.getAttribute('aria-label'));
        if ((r.height < 43.5 || r.width < 43.5) && !el.closest('.mundo')) chicos.push(`${(el.textContent.trim() || el.getAttribute('aria-label') || '').slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const piezas = [...raiz.querySelectorAll('.hud > [data-tapa], .avisos-mundo .aviso-puerta, .dlg')].filter((el) => !el.closest('.modal, .capitulo')).map((el) => ({ el, r: el.getBoundingClientRect() }));
      const solapes = [];
      for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) {
        const a = piezas[i], b = piezas[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left); const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 1 && y > 1) solapes.push(`${a.el.className.split(' ').pop()} x ${b.el.className.split(' ').pop()}`);
      }
      return { tapa: raiz.dataset.tapa, alto: raiz.dataset.altoOcupado || '', fuera, chicos, solapes };
    });
    const nombre = `muestra-${tam}-${estado}${variante === 'A' ? '-A' : ''}.png`;
    await page.locator('#solo').screenshot({ path: path.join(salida, nombre) });
    informe.push({ tam, estado, ...datos });
  }
  if (errores.length) informe.push({ tam, errores });
  await page.close();
}
await browser.close();
for (const r of informe) console.log(JSON.stringify(r));
