import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Page, expect, test } from '@playwright/test';

import { entrarALaPrimeraSala } from './support/autoria-flujo';

/**
 * Trayectos de personas en el juego real (bloque G1, revisión del trabajo de Codex en `feat/n1-trayectos`).
 *
 * Se corre contra la pila de la prueba (`.superpowers/scripts/levantar-n1.ps1`), que publica una COPIA de SIM-VBG-002 con
 * dos trayectos en la entrada de urgencias: la enfermera en circuito (triángulo con dos tramos en diagonal) y el vigilante
 * de ida y vuelta. El caso insignia no se toca.
 *
 *   E2E_BASE_URL=http://localhost:4382 npx playwright test e2e/trayectos-captura.e2e.ts
 *
 * Lee la escena por `ng.getComponent` (servidor de desarrollo) y guarda capturas y el registro de posiciones en
 * `.superpowers/noche-2026-11-14/capturas-n1/`.
 */

const CARPETA = process.env['N1_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-n1');

const ENFERMERA = { partida: { x: 700, y: 310 }, puntos: [{ x: 820, y: 310 }, { x: 760, y: 390 }], modo: 'circuito' };
const VIGILANTE = { partida: { x: 300, y: 320 }, puntos: [{ x: 360, y: 420 }, { x: 460, y: 430 }], modo: 'ida-y-vuelta' };

interface Persona { x: number; y: number; dir: string; walking: boolean; ruta: number }
interface Muestra { t: number; personas: Record<string, Persona>; jugador: { x: number; y: number } | null; pausado: boolean }

/** Lo que la escena sabe ahora: cada persona que camina, el jugador y si hay una capa abierta. */
async function muestra(page: Page): Promise<Muestra> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const cmp = w['ng']?.getComponent?.(document.querySelector('app-game-world'));
    const scenes: any[] = cmp?.phaserGame?.scene?.getScenes?.(true) ?? [];
    const scene = scenes.find(s => s.personWalkers instanceof Map);
    const out = { t: performance.now(), personas: {} as Record<string, unknown>, jugador: null as unknown, pausado: false };
    if (!scene) return out as never;
    out.pausado = Boolean(scene.motionPaused);
    for (const [key, walker] of scene.personWalkers as Map<string, any>) {
      const s = walker.state;
      out.personas[key] = { x: s.x, y: s.y, dir: s.direction, walking: s.walking, ruta: s.routeIndex };
    }
    if (scene.player) out.jugador = { x: scene.player.x, y: scene.player.y };
    return out as never;
  });
}

/** Clave de la persona que camina con esa partida (la escena las guarda por clave de objeto). */
function claveDe(m: Muestra, partida: { x: number; y: number }, puntos: { x: number; y: number }[]): string {
  const paradas = [partida, ...puntos];
  const clave = Object.entries(m.personas).find(([, p]) => paradas.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 200))?.[0];
  if (!clave) throw new Error(`no hay persona que camine cerca de ${JSON.stringify(partida)}: ${JSON.stringify(m.personas)}`);
  return clave;
}

/** Distancia de un punto a los tramos rectos del trayecto. */
function fueraDeTramos(p: { x: number; y: number }, ruta: typeof ENFERMERA): number {
  const paradas = [ruta.partida, ...ruta.puntos];
  const tramos = paradas.slice(1).map((b, i) => [paradas[i], b] as const);
  if (ruta.modo === 'circuito') tramos.push([paradas[paradas.length - 1], paradas[0]] as const);
  return Math.min(...tramos.map(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }));
}

const ANILLO = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
/** La vista del kit hacia la que apunta un vector de pantalla (y crece hacia abajo). */
function vistaDe(dx: number, dy: number): string {
  return ANILLO[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
}

async function registrar(page: Page, ms: number, cada = 200): Promise<Muestra[]> {
  const muestras: Muestra[] = [];
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    muestras.push(await muestra(page));
    await page.waitForTimeout(cada);
  }
  return muestras;
}

test.describe('trayectos de personas en el juego real (captura)', () => {
  test.setTimeout(240_000);

  test('la enfermera da su circuito y el vigilante va y viene, en 8 direcciones y sin salirse de sus tramos', async ({ page }) => {
    mkdirSync(CARPETA, { recursive: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await entrarALaPrimeraSala(page);
    await page.waitForTimeout(1000);
    const primera = await muestra(page);
    const enfermera = claveDe(primera, ENFERMERA.partida, ENFERMERA.puntos);
    const vigilante = claveDe(primera, VIGILANTE.partida, VIGILANTE.puntos);

    const muestras: Muestra[] = [];
    const fotos: Array<[number, string]> = [[5_000, 'caminando-1'], [11_000, 'caminando-2']];
    const inicio = Date.now();
    while (Date.now() - inicio < 26_000) {
      muestras.push(await muestra(page));
      const pendiente = fotos[0];
      if (pendiente && Date.now() - inicio >= pendiente[0]) {
        fotos.shift();
        await page.screenshot({ path: path.join(CARPETA, `trayectos-${pendiente[1]}-1366x768.png`) });
      }
      await page.waitForTimeout(150);
    }
    writeFileSync(path.join(CARPETA, 'trayectos-registro.json'), JSON.stringify({ enfermera, vigilante, muestras }, null, 1));

    for (const [clave, ruta] of [[enfermera, ENFERMERA], [vigilante, VIGILANTE]] as const) {
      const serie = muestras.map(m => m.personas[clave]).filter(Boolean);
      // Nunca sale de sus tramos rectos (los que comprueba OCL-19).
      expect(Math.max(...serie.map(p => fueraDeTramos(p, ruta)))).toBeLessThan(0.5);
      // Pasa por cada punto declarado.
      for (const punto of ruta.puntos) expect(serie.some(p => Math.hypot(p.x - punto.x, p.y - punto.y) < 0.5)).toBe(true);
      // Sin patinar: cuando avanza camina, y mira hacia donde avanza (o una vecina, durante el giro).
      let tramosConMovimiento = 0, mirandoBien = 0;
      for (let i = 1; i < serie.length; i++) {
        const dx = serie[i].x - serie[i - 1].x, dy = serie[i].y - serie[i - 1].y;
        if (Math.hypot(dx, dy) < 3) continue;
        tramosConMovimiento++;
        expect(serie[i].walking || serie[i - 1].walking).toBe(true);
        const esperada = ANILLO.indexOf(vistaDe(dx, dy));
        const vista = ANILLO.indexOf(serie[i].dir);
        const separacion = Math.min((vista - esperada + 8) % 8, (esperada - vista + 8) % 8);
        if (separacion <= 1) mirandoBien++;
      }
      expect(tramosConMovimiento).toBeGreaterThan(10);
      expect(mirandoBien / tramosConMovimiento).toBeGreaterThan(0.9);
      // Las diagonales del kit aparecen al caminar.
      expect(serie.some(p => p.walking && p.dir.includes('-'))).toBe(true);
    }
  });

  test('al hablarle se detiene, mira al estudiante y retoma al cerrar', async ({ page }) => {
    mkdirSync(CARPETA, { recursive: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await entrarALaPrimeraSala(page);
    await page.waitForTimeout(1000);
    const enfermera = claveDe(await muestra(page), ENFERMERA.partida, ENFERMERA.puntos);

    // Acercarse con el teclado (lazo cerrado) hasta 50 px de la enfermera y hablarle.
    const limite = Date.now() + 40_000;
    let cerca = false;
    while (Date.now() < limite && !cerca) {
      const m = await muestra(page);
      const p = m.personas[enfermera];
      const j = m.jugador;
      if (!p || !j) { await page.waitForTimeout(100); continue; }
      const dx = p.x - j.x, dy = p.y - j.y;
      if (Math.hypot(dx, dy) < 50) { cerca = true; break; }
      const teclas = [...(Math.abs(dx) > 8 ? [dx > 0 ? 'd' : 'a'] : []), ...(Math.abs(dy) > 8 ? [dy > 0 ? 's' : 'w'] : [])];
      for (const t of teclas) await page.keyboard.down(t);
      await page.waitForTimeout(120);
      for (const t of teclas) await page.keyboard.up(t);
    }
    expect(cerca).toBe(true);
    await page.keyboard.press('e');
    await expect.poll(async () => (await muestra(page)).pausado, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(900);
    const durante = await registrar(page, 3_000);
    await page.screenshot({ path: path.join(CARPETA, 'trayectos-hablando-1366x768.png') });
    const quieta = durante.map(m => m.personas[enfermera]);
    expect(new Set(quieta.map(p => `${p.x},${p.y}`)).size).toBe(1);
    const j = durante[durante.length - 1].jugador as { x: number; y: number };
    const p = quieta[quieta.length - 1];
    const haciaJugador = ANILLO.indexOf(vistaDe(j.x - p.x, j.y - p.y));
    const vista = ANILLO.indexOf(p.dir);
    expect(Math.min((vista - haciaJugador + 8) % 8, (haciaJugador - vista + 8) % 8)).toBeLessThanOrEqual(1);

    // Cerrar el diálogo (Esc hasta que no quede capa) y comprobar que retoma su camino.
    for (let i = 0; i < 6 && (await muestra(page)).pausado; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    expect((await muestra(page)).pausado).toBe(false);
    // Sale del radio del jugador para no estorbarla y espera a que retome.
    for (const t of ['s']) { await page.keyboard.down(t); await page.waitForTimeout(700); await page.keyboard.up(t); }
    const antes = (await muestra(page)).personas[enfermera];
    await expect.poll(async () => {
      const ahora = (await muestra(page)).personas[enfermera];
      return Math.hypot(ahora.x - antes.x, ahora.y - antes.y);
    }, { timeout: 15_000 }).toBeGreaterThan(5);
  });

  test('con «reducir movimiento» nadie se mueve', async ({ browser }) => {
    const contexto = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
    const page = await contexto.newPage();
    try {
      await entrarALaPrimeraSala(page);
      await page.waitForTimeout(1000);
      const serie = await registrar(page, 8_000, 400);
      const primera = serie[0];
      const enfermera = claveDe(primera, ENFERMERA.partida, ENFERMERA.puntos);
      const vigilante = claveDe(primera, VIGILANTE.partida, VIGILANTE.puntos);
      for (const [clave, ruta] of [[enfermera, ENFERMERA], [vigilante, VIGILANTE]] as const) {
        for (const m of serie) {
          expect(m.personas[clave]).toMatchObject({ x: ruta.partida.x, y: ruta.partida.y, walking: false });
        }
      }
      await page.screenshot({ path: path.join(CARPETA, 'trayectos-movimiento-reducido-1366x768.png') });
    } finally {
      await contexto.close();
    }
  });
});
