import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { llegada, zonaCaminable } from '../src/app/features/simulator/sala/geometria';
import type { Encuadre, Muro } from '../src/app/features/simulator/sala/geometria';
import { entrarALaPrimeraSala } from './support/autoria-flujo';

/**
 * Captura del juego real con una sala del hospital por piezas (bloque P2, diseño 4.3-4.4).
 *
 * El servidor de esta rama todavía no entrega `map.structure` (es del bloque P3, contrato x-siep 2.2): mientras tanto la prueba
 * intercepta cada respuesta que trae el mundo y le pone, para la primera sala del caso, la estructura de la entrada de
 * urgencias del hospital de P1 (`biblioteca/piezas/lugares/hospital.json`), las paredes que deduce el servidor (contrato
 * 1.6) y el muro, la posición y el modelo de sus puertas, con su umbral `x, y` (contrato 3.2). Lo demás del mundo es real.
 * Cuando P3 esté fusionado se quita `ponerHospital` y la prueba usa el dato real.
 *
 * Se corre contra la pila de P2 (`.superpowers/scripts/levantar-p2.ps1`):
 *   E2E_BASE_URL=http://localhost:4381 npx playwright test e2e/salas-por-piezas-captura.e2e.ts
 */

const CARPETA = process.env['P2_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-p2');
const HOSPITAL = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'biblioteca', 'piezas', 'lugares', 'hospital.json'), 'utf8'));

interface Sala {
  id: string;
  encuadre: Encuadre;
  estructura: { ancho: number; momento?: string };
  entrada?: [number, number] | { x: number; y: number };
  puertas: { id: string; muro: Muro; pos: number; modelo: string; par?: string; etiqueta?: string }[];
}

type Mundo = Record<string, any>;

/** Paredes que el servidor deduce de la geometría (contrato 1.6). */
function paredes(sala: Sala) {
  const ancho = sala.estructura.ancho;
  const [x0, , w] = zonaCaminable(sala.encuadre, ancho);
  const x1 = x0 + w;
  return [
    { key: 'pared-fondo', label: 'Pared del fondo', x: 0, y: 0, width: ancho, height: 236 },
    { key: 'pared-izquierda', label: 'Pared izquierda', x: 0, y: 236, width: x0, height: 250 },
    { key: 'pared-derecha', label: 'Pared derecha', x: x1, y: 236, width: ancho - x1, height: 250 },
    { key: 'borde-delantero', label: 'Borde delantero', x: 0, y: 486, width: ancho, height: 42 },
  ];
}

/** Le pone al mundo la sala por piezas que le toca a su mapa (la primera sala del caso → la entrada de urgencias). */
function ponerHospital(mundo: Mundo, salasPorMapa: Map<string, Sala>): void {
  const mapa = mundo['map'];
  if (!mapa?.key || !Array.isArray(mundo['objects'])) return;
  if (!salasPorMapa.has(mapa.key)) salasPorMapa.set(mapa.key, HOSPITAL.salas[Math.min(salasPorMapa.size, HOSPITAL.salas.length - 1)]);
  const sala = salasPorMapa.get(mapa.key)!;
  const ancho = sala.estructura.ancho;
  mapa.structure = sala.estructura;
  mapa.width = ancho;
  mapa.height = 528;
  mapa.ambient = { ...(mapa.ambient ?? {}), encuadre: sala.encuadre, lugarId: 'hospital', salaId: sala.id };
  delete mapa.ambient.backgroundImage;
  if (Array.isArray(mundo['collisions'])) mundo['collisions'] = paredes(sala);
  let n = 0;
  for (const objeto of mundo['objects']) {
    if (objeto.type !== 'EXIT' || n >= sala.puertas.length) continue;
    const puerta = sala.puertas[n++];
    const [x, y] = llegada(puerta.muro, puerta.pos, sala.encuadre, ancho);
    objeto.x = x;
    objeto.y = y;
    objeto.metadata = { ...(objeto.metadata ?? {}), muro: puerta.muro, pos: puerta.pos, modelo: puerta.modelo };
    delete objeto.metadata.pintada;
  }
  // Las puertas que el mapa del caso no trae (sus salidas vivían en el ScenarioConfig del legado) se añaden como las
  // mandará el servidor de P3: un EXIT por puerta, con su umbral. Cruzarlas pide al servidor una clave que no conoce:
  // la prueba solo las mira (abrirse, rótulo), no las cruza.
  for (const puerta of sala.puertas.slice(n)) {
    const [x, y] = llegada(puerta.muro, puerta.pos, sala.encuadre, ancho);
    n++;
    mundo['objects'].push({   // forma de `MapObjectState`
      key: puerta.id, label: puerta.etiqueta ?? puerta.id, type: 'EXIT', x, y, width: 32, height: 32,
      color: '#ffffff', icon: 'door', shortCode: '', collision: false,
      interactionPrompt: puerta.etiqueta ?? '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
      facing: 'down', movementPattern: {},
      metadata: { muro: puerta.muro, pos: puerta.pos, modelo: puerta.modelo, par: puerta.par, targetNodeKey: (puerta as { hacia?: string }).hacia },
    });
  }
  const [zx, zy, zw, zh] = zonaCaminable(sala.encuadre, ancho);
  const jugador = mundo['player'];
  if (jugador && (jugador.x < zx || jugador.x > zx + zw || jugador.y < zy || jugador.y > zy + zh)) {
    const entrada = Array.isArray(sala.entrada) ? { x: sala.entrada[0], y: sala.entrada[1] } : sala.entrada ?? { x: ancho / 2, y: 420 };
    jugador.x = entrada.x;
    jugador.y = entrada.y;
  }
}

/** Busca, dentro de una respuesta, cada objeto que es un mundo (trae `map` y `objects`) y lo transforma. */
function recorrer(valor: unknown, salasPorMapa: Map<string, Sala>): void {
  if (!valor || typeof valor !== 'object') return;
  const objeto = valor as Mundo;
  if (objeto['map'] && Array.isArray(objeto['objects'])) ponerHospital(objeto, salasPorMapa);
  for (const hijo of Object.values(objeto)) recorrer(hijo, salasPorMapa);
}

async function interceptarMundo(page: Page): Promise<void> {
  const salasPorMapa = new Map<string, Sala>();
  await page.route('**/api/**', async route => {
    const respuesta = await route.fetch();
    if (!(respuesta.headers()['content-type'] ?? '').includes('json')) return route.fulfill({ response: respuesta });
    const cuerpo = await respuesta.json().catch(() => null);
    if (cuerpo === null) return route.fulfill({ response: respuesta });
    recorrer(cuerpo, salasPorMapa);
    return route.fulfill({ response: respuesta, json: cuerpo });
  });
}

test.describe('salas por piezas en el juego real (captura)', () => {
  test.setTimeout(180_000);

  for (const [ancho, alto] of [[1366, 768], [1920, 1080]] as const) {
    test(`entrada de urgencias por piezas a ${ancho} × ${alto}`, async ({ page }) => {
      mkdirSync(CARPETA, { recursive: true });
      await page.setViewportSize({ width: ancho, height: alto });
      page.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
      page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      page.on('requestfailed', r => console.log('[requestfailed]', r.url()));
      await interceptarMundo(page);
      await entrarALaPrimeraSala(page);
      const mundo = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
      await expect(mundo).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(CARPETA, `juego-real-entrada-urgencias-noche-${ancho}x${alto}.png`) });
      // Hacia la corrediza del fondo: se abre y aparece su rótulo.
      await page.keyboard.down('w');
      await page.waitForTimeout(1600);
      await page.keyboard.up('w');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(CARPETA, `juego-real-entrada-urgencias-puerta-${ancho}x${alto}.png`) });
    });
  }
});
