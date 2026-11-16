import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { llegada, zonaCaminable } from '../src/app/features/simulator/sala/geometria';
import type { Encuadre, Muro } from '../src/app/features/simulator/sala/geometria';
import { entrarALaPrimeraSala } from './support/autoria-flujo';
import { createWorldInputDriver, readPlayerPosition, waitUntilPlayerStill } from './support/siep-flow';

/**
 * El juego real con las salas del hospital por piezas (bloque P2, diseño 4.3-4.4): capturas y cruce de puertas.
 *
 * El servidor de esta rama todavía no entrega `map.structure` (es del bloque P3, contrato x-siep 2.2). Mientras tanto la
 * prueba hace de servidor para la sala, con lo que el contrato dice que mandará:
 * - al mundo que llega del servidor (`/world`, y el que devuelven las acciones) le pone la sala del hospital de P1 en la
 *   que está el jugador (`biblioteca/piezas/lugares/hospital.json`): `map.structure`, el encuadre, las paredes que deduce
 *   el servidor (contrato 1.6) y un EXIT por puerta con su muro, posición y modelo, en su umbral `x, y` (contrato 3.2);
 * - `enter-room` por una puerta de pieza responde con la sala de destino y el jugador en la puerta recíproca (`par`);
 * - `world-state` (guardar la posición) responde con la sala actual sin tocar el servidor, que no la conoce.
 * Lo demás (intento, consentimiento, personas de la primera escena) es real. Cuando P3 esté fusionado, la prueba se
 * corre sin este doble y con un caso sembrado con `estructura`.
 *
 * Se corre contra la pila de P2 (`.superpowers/scripts/levantar-p2.ps1`):
 *   E2E_BASE_URL=http://localhost:4381 npx playwright test e2e/salas-por-piezas-captura.e2e.ts
 */

const CARPETA = process.env['P2_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-p2');
const HOSPITAL = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'biblioteca', 'piezas', 'lugares', 'hospital.json'), 'utf8'));
const MANIFIESTO = JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', 'biblioteca', 'piezas', 'manifiesto.json'), 'utf8'));

type Momento = 'dia' | 'noche';

interface Puerta { id: string; muro: Muro; pos: number; modelo: string; par?: string; hacia?: string; etiqueta?: string }
interface Sala {
  id: string;
  encuadre: Encuadre;
  estructura: { ancho: number; momento?: string };
  entrada?: { x: number; y: number };
  puertas: Puerta[];
  muebles?: { ref: string; x: number; y: number; espejo?: boolean }[];
}

type Mundo = Record<string, any>;

const SALAS: Sala[] = HOSPITAL.salas;
const salaPorId = (id: string): Sala => SALAS.find(s => s.id === id)!;
const claveDeMapa = (sala: Sala) => `hospital-${sala.id}`;

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

/**
 * El rótulo de un EXIT es el nombre del lugar («Sala de escucha familiar», como en el caso): el verbo lo pone la barra
 * («Pasar a …»). La `etiqueta` de la puerta en `hospital.json` ya trae el verbo; se le quita.
 */
function nombreDelLugar(puerta: Puerta): string {
  const sinVerbo = (puerta.etiqueta ?? puerta.hacia ?? puerta.id).replace(/^(pasar|salir|volver|ir)\s+(a la|al|a)\s+/i, '');
  return sinVerbo.charAt(0).toUpperCase() + sinVerbo.slice(1);
}

/** Un EXIT de puerta de pieza con la forma de `MapObjectState`. */
function exitDePuerta(sala: Sala, puerta: Puerta, cerradas: Record<string, Record<string, string[]>>) {
  const [x, y] = llegada(puerta.muro, puerta.pos, sala.encuadre, sala.estructura.ancho);
  const lugar = nombreDelLugar(puerta);
  return {
    key: puerta.id, label: lugar, type: 'EXIT', x, y, width: 32, height: 32,
    color: '#ffffff', icon: 'door', shortCode: '', collision: false,
    interactionPrompt: `Entrar: ${lugar}`, interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
    facing: 'down', movementPattern: {},
    metadata: { muro: puerta.muro, pos: puerta.pos, modelo: puerta.modelo, par: puerta.par, targetNodeKey: puerta.hacia,
      ...(cerradas[`${sala.id}/${puerta.id}`] ?? {}) },
  };
}

interface Doble {
  sala: Sala;
  momento: Momento;
  /** Requisitos por puerta (`sala/puerta` → `{ requiresTools: […] }`): la puerta queda cerrada y dice qué falta. */
  cerradas: Record<string, Record<string, string[]>>;
  /** Las personas de la primera escena del caso: solo en la sala donde empieza. */
  personas: unknown[] | null;
  salaInicial: Sala;
  /** Si se da, quien juega empieza junto al objeto del caso cuyo rótulo casa (para medir el revisar). */
  junto?: RegExp;
}

/**
 * Los muebles de la sala (`hospital.json`) como los copia el servidor de P3: un objeto PROP con su arte de la biblioteca,
 * apoyado en sus pies (el juego reconoce la pieza por su arte y la dibuja con su hoja y su animación).
 */
function mueblesDeSala(sala: Sala) {
  return (sala.muebles ?? []).flatMap((m, n) => {
    const ficha = MANIFIESTO.muebles?.[`hospital/${m.ref}`];
    if (!ficha) return [];
    return [{
      key: `mueble-${n}-${m.ref}`, label: ficha.nombre ?? m.ref, type: 'PROP', x: m.x, y: m.y, width: ficha.ancho, height: ficha.alto,
      color: '#ffffff', icon: '', shortCode: '', collision: false, interactionPrompt: '', interactionText: '',
      decisionOptionId: null, toolCode: null, dialogue: null, facing: m.espejo ? 'left' : 'right', movementPattern: {},
      metadata: { arte: `/assets/biblioteca/${ficha.ruta}`, apoyo: 'pies' },
    }];
  });
}

/** Le pone al mundo la sala por piezas en la que está el jugador. */
function ponerSala(mundo: Mundo, doble: Doble, jugador?: { x: number; y: number }): void {
  const { sala } = doble;
  const ancho = sala.estructura.ancho;
  const mapa = mundo['map'];
  if (doble.personas === null) doble.personas = (mundo['objects'] as Mundo[]).filter(o => o['type'] !== 'EXIT');
  mapa.key = claveDeMapa(sala);
  mapa.title = sala === doble.salaInicial && mapa.title ? mapa.title : `Hospital — ${sala.id.replace(/-/g, ' ')}`;
  mapa.structure = { ...sala.estructura, momento: doble.momento };
  mapa.width = ancho;
  mapa.height = 528;
  mapa.ambient = { ...(mapa.ambient ?? {}), encuadre: sala.encuadre, lugarId: 'hospital', salaId: sala.id };
  delete mapa.ambient.backgroundImage;
  mundo['collisions'] = paredes(sala);
  const personas = sala === doble.salaInicial ? (doble.personas as Mundo[]) : [];
  mundo['objects'] = [...personas, ...mueblesDeSala(sala), ...sala.puertas.map(p => exitDePuerta(sala, p, doble.cerradas))];
  const [zx, zy, zw, zh] = zonaCaminable(sala.encuadre, ancho);
  const actual = mundo['player'] ?? {};
  const dentro = (p: { x: number; y: number }) => p.x >= zx && p.x <= zx + zw && p.y >= zy && p.y <= zy + zh;
  const objeto = doble.junto && !jugador ? (personas as Mundo[]).find(o => doble.junto!.test(String(o['label'] ?? ''))) : undefined;
  const destino = jugador ?? (objeto ? { x: Number(objeto['x']) + 26, y: Number(objeto['y']) + 4 }
    : dentro(actual) ? actual : sala.entrada ?? { x: ancho / 2, y: 420 });
  mundo['player'] = { ...actual, x: destino.x, y: destino.y, mapKey: mapa.key };
}

/** Busca, dentro de una respuesta, cada objeto que es un mundo (trae `map` y `objects`). */
function mundosDe(valor: unknown, encontrados: Mundo[] = []): Mundo[] {
  if (!valor || typeof valor !== 'object') return encontrados;
  const objeto = valor as Mundo;
  if (objeto['map'] && Array.isArray(objeto['objects'])) encontrados.push(objeto);
  for (const hijo of Object.values(objeto)) mundosDe(hijo, encontrados);
  return encontrados;
}

async function hacerDeServidor(page: Page, doble: Doble): Promise<void> {
  let ultimo: Mundo | null = null;   // el último cuerpo con mundo que mandó el servidor de verdad
  await page.route('**/api/**', async route => {
    const peticion = route.request();
    const ruta = new URL(peticion.url()).pathname;
    if (ultimo && peticion.method() === 'POST' && /\/enter-room$/.test(ruta)) {
      const { doorKey } = peticion.postDataJSON() as { doorKey: string };
      const puerta = doble.sala.puertas.find(p => p.id === doorKey);
      if (puerta?.hacia) {
        const destino = salaPorId(puerta.hacia);
        const reciproca = destino.puertas.find(p => p.id === puerta.par);
        doble.sala = destino;
        const cuerpo = structuredClone(ultimo);
        const [x, y] = reciproca ? llegada(reciproca.muro, reciproca.pos, destino.encuadre, destino.estructura.ancho) : [0, 0];
        for (const mundo of mundosDe(cuerpo)) ponerSala(mundo, doble, reciproca ? { x, y } : undefined);
        return route.fulfill({ status: 200, json: cuerpo });
      }
    }
    if (ultimo && peticion.method() === 'PATCH' && /\/world-state$/.test(ruta)) {
      const { playerX, playerY } = peticion.postDataJSON() as { playerX: number; playerY: number };
      const cuerpo = structuredClone(ultimo);
      for (const mundo of mundosDe(cuerpo)) ponerSala(mundo, doble, { x: playerX, y: playerY });
      return route.fulfill({ status: 200, json: cuerpo });
    }
    const respuesta = await route.fetch();
    if (!(respuesta.headers()['content-type'] ?? '').includes('json')) return route.fulfill({ response: respuesta });
    const cuerpo = await respuesta.json().catch(() => null);
    const mundos = cuerpo === null ? [] : mundosDe(cuerpo);
    if (mundos.length === 0) return route.fulfill({ response: respuesta });
    ultimo = structuredClone(cuerpo);
    for (const mundo of mundos) ponerSala(mundo, doble);
    return route.fulfill({ response: respuesta, json: cuerpo });
  });
}

async function capturar(page: Page, nombre: string): Promise<void> {
  const { width, height } = page.viewportSize()!;
  await page.screenshot({ path: path.join(CARPETA, `juego-real-${nombre}-${width}x${height}.png`) });
}

type Input = ReturnType<typeof createWorldInputDriver>;

/** Camina hasta el umbral de una puerta (en lazo cerrado sobre data-player-x/y): primero en x, luego en y. */
async function caminarAlUmbral(page: Page, input: Input, sala: Sala, puertaId: string): Promise<void> {
  const puerta = sala.puertas.find(p => p.id === puertaId)!;
  const [x, y] = llegada(puerta.muro, puerta.pos, sala.encuadre, sala.estructura.ancho);
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const p = await readPlayerPosition(page);
    if (Math.abs(x - p.x) > 4) await input.moveBy(x > p.x ? 'ArrowRight' : 'ArrowLeft', Math.abs(x - p.x));
    const q = await readPlayerPosition(page);
    if (Math.abs(y - q.y) > 4) await input.moveBy(y > q.y ? 'ArrowDown' : 'ArrowUp', Math.abs(y - q.y));
    const r = await readPlayerPosition(page);
    if (Math.hypot(x - r.x, y - r.y) <= 12) return;
  }
}

const mapaPintado = (page: Page, sala: Sala) => expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))
  .toHaveAttribute('data-rendered-map-key', claveDeMapa(sala), { timeout: 30_000 });

async function empezar(page: Page, salaInicial: Sala, momento: Momento, cerradas: Doble['cerradas'] = {}): Promise<Doble> {
  mkdirSync(CARPETA, { recursive: true });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  const doble: Doble = { sala: salaInicial, salaInicial, momento, cerradas, personas: null };
  await hacerDeServidor(page, doble);
  await entrarALaPrimeraSala(page);
  await mapaPintado(page, salaInicial);
  await page.waitForTimeout(3200);   // el rótulo del capítulo y el fundido de entrada
  return doble;
}

test.describe('salas por piezas en el juego real', () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(() => test.setTimeout(240_000));

  for (const [ancho, alto] of [[1366, 768], [1920, 1080]] as const) {
    for (const momento of ['noche', 'dia'] as const) {
      test(`cruzar puertas a ${ancho} × ${alto} de ${momento}`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: alto });
        const entrada = salaPorId('entrada-urgencias');
        const espera = salaPorId('sala-espera');
        // La puerta del fondo de la sala de espera queda cerrada: le falta una herramienta.
        await empezar(page, entrada, momento, { 'sala-espera/a-pasillo': { requiresTools: ['protocolo-epa'] } });
        await capturar(page, `entrada-urgencias-${momento}`);

        // Acercarse a la corrediza del fondo: se abre y la barra ofrece pasar.
        const input = createWorldInputDriver(page, 'keyboard');
        await caminarAlUmbral(page, input, entrada, 'a-espera');
        const pasar = page.locator('button.context-bar__interaction').filter({ hasText: /sala de espera/i }).first();
        await waitUntilPlayerStill(page);
        await page.waitForTimeout(500);
        await capturar(page, `entrada-urgencias-puerta-${momento}`);

        // E cruza: fundido y la sala de espera, con el jugador en su puerta recíproca (la de la cámara).
        await expect(pasar).toBeVisible();
        await page.keyboard.press('e');
        await mapaPintado(page, espera);
        await page.waitForTimeout(3200);   // el rótulo del capítulo y el fundido de llegada
        const llegado = await readPlayerPosition(page);
        const [rx, ry] = llegada('camara', 586, espera.encuadre, espera.estructura.ancho);
        expect(Math.abs(llegado.x - rx)).toBeLessThanOrEqual(2);
        expect(Math.abs(llegado.y - ry)).toBeLessThanOrEqual(2);
        await capturar(page, `sala-espera-llegada-${momento}`);

        // La puerta del fondo está cerrada: E la sacude y el aviso dice qué falta (door-status.util, sin cambios).
        await caminarAlUmbral(page, input, espera, 'a-pasillo');
        const cerrada = page.locator('button.context-bar__interaction').filter({ hasText: /pasillo/i }).first();
        await waitUntilPlayerStill(page);
        await expect(cerrada).toBeVisible();
        await page.keyboard.press('e');
        await page.waitForTimeout(250);
        await capturar(page, `sala-espera-puerta-cerrada-${momento}`);
        await expect(page.getByText(/Antes de pasar, recoge algo de la sala/).first()).toBeVisible();
        await expect(page.locator('app-game-world .phaser-host')).toHaveAttribute('data-rendered-map-key', claveDeMapa(espera));
      });
    }
  }

  test('cruzar ida y vuelta con movimiento reducido', async ({ page }) => {
    // El juego lee `prefers-reduced-motion` al abrir: la puerta queda abierta del todo sin animarse y la flecha, quieta.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1366, height: 768 });
    const entrada = salaPorId('entrada-urgencias');
    const espera = salaPorId('sala-espera');
    await empezar(page, entrada, 'noche');
    const input = createWorldInputDriver(page, 'keyboard');
    await caminarAlUmbral(page, input, entrada, 'a-espera');
    await capturar(page, 'reducido-entrada-puerta');   // sin esperar: abierta ya, sin cuadros intermedios
    await expect(page.locator('button.context-bar__interaction').filter({ hasText: /sala de espera/i }).first()).toBeVisible();
    await page.keyboard.press('e');
    await mapaPintado(page, espera);
    await page.waitForTimeout(3200);
    await capturar(page, 'reducido-sala-espera-llegada');

    // De vuelta por la misma puerta (antes, unos pasos dentro: `doorInteractionArmed`): aparece en la corrediza del fondo.
    await input.moveBy('ArrowUp', 120);   // el juego exige alejarse 72 px de toda puerta antes de volver a cruzar
    await caminarAlUmbral(page, input, espera, 'a-entrada');
    await waitUntilPlayerStill(page);
    await expect(page.locator('button.context-bar__interaction').filter({ hasText: /entrada de urgencias/i }).first()).toBeVisible();
    await page.keyboard.press('e');
    await mapaPintado(page, entrada);
    await page.waitForTimeout(3200);
    const vuelta = await readPlayerPosition(page);
    const [vx, vy] = llegada('fondo', 485, entrada.encuadre, entrada.estructura.ancho);
    expect(Math.abs(vuelta.x - vx)).toBeLessThanOrEqual(2);
    expect(Math.abs(vuelta.y - vy)).toBeLessThanOrEqual(2);
    await capturar(page, 'reducido-entrada-vuelta');
  });

  // Regla 3 de calidad: la sombra proyectada es la silueta de quien la proyecta y camina con él.
  for (const [salaId, momento, pasos] of [
    ['sala-escucha', 'noche', [['ArrowLeft', 140], ['ArrowUp', 60]]],
    ['sala-escucha', 'dia', [['ArrowUp', 120]]],
    ['entrada-urgencias', 'dia', [['ArrowRight', 160], ['ArrowUp', 90]]],
  ] as const) {
    test(`sombras con silueta en ${salaId} de ${momento}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      const sala = salaPorId(salaId);
      await empezar(page, sala, momento);
      const input = createWorldInputDriver(page, 'keyboard');
      for (const [tecla, px] of pasos) await input.moveBy(tecla, px);
      await waitUntilPlayerStill(page);
      await page.waitForTimeout(400);
      await capturar(page, `sombras-${salaId}-${momento}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(2500);
      await capturar(page, `sombras-${salaId}-${momento}`);
    });
  }

  // Regla 3 de calidad: la sombra de quien camina y la de dos muebles es su silueta, de día y de noche.
  for (const momento of ['dia', 'noche'] as const) {
    test(`sombras con silueta de quien camina y de los muebles, de ${momento}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      const sala = salaPorId('habitacion-recuperacion');
      await empezar(page, sala, momento);
      const input = createWorldInputDriver(page, 'keyboard');
      await input.moveBy('ArrowUp', 70);
      await waitUntilPlayerStill(page);
      await page.waitForTimeout(500);
      await capturar(page, `sombras-muebles-${momento}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(2500);
      await capturar(page, `sombras-muebles-${momento}`);
    });
  }

  // Rendimiento (ventana V2): tiempo de cuadro al caminar y tirón al revisar un objeto, con la CPU frenada ×4.
  test('medir: cuadro al caminar y tirón al revisar, CPU ×4', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const sala = salaPorId('habitacion-recuperacion');
    mkdirSync(CARPETA, { recursive: true });
    const doble: Doble = { sala, salaInicial: sala, momento: 'noche', cerradas: {}, personas: null, junto: /kit/i };
    await hacerDeServidor(page, doble);
    await entrarALaPrimeraSala(page);
    await mapaPintado(page, sala);
    await page.waitForTimeout(3500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const grabar = () => page.evaluate(() => {
      const w = window as unknown as { __cuadros: number[]; __grabando: boolean };
      w.__cuadros = [];
      w.__grabando = true;
      let t = performance.now();
      const paso = (n: number) => { w.__cuadros.push(n - t); t = n; if (w.__grabando) requestAnimationFrame(paso); };
      requestAnimationFrame(paso);
    });
    const leer = () => page.evaluate(() => {
      const w = window as unknown as { __cuadros: number[]; __grabando: boolean };
      w.__grabando = false;
      return w.__cuadros.slice(1);
    });
    const resumen = (c: number[]) => {
      const o = [...c].sort((a, b) => a - b);
      const p = (q: number) => o[Math.min(o.length - 1, Math.floor(q * o.length))] ?? 0;
      return { cuadros: c.length, p50: Math.round(p(0.5) * 10) / 10, p95: Math.round(p(0.95) * 10) / 10, max: Math.round((o[o.length - 1] ?? 0) * 10) / 10 };
    };
    await grabar();
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowLeft');
    const caminar = resumen(await leer());
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(800);
    await grabar();
    const respuesta = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/interactions/'), { timeout: 15_000 }).catch(() => null);
    await page.keyboard.press('e');
    const r = await respuesta;
    await page.waitForTimeout(3000);
    const revisar = resumen(await leer());
    console.log('[medida]', JSON.stringify({ caminar, revisar, interaccion: r ? new URL(r.url()).pathname : null }));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });

  // V2: revisar un objeto ya no rearma la sala; la imagen del lienzo antes y después debe ser la misma salvo lo que cambió
  // de verdad (el objeto recogido y su rótulo). Con movimiento reducido, para que nada se mueva entre las dos tomas.
  test('la sala se ve igual tras revisar un objeto (movimiento reducido)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1366, height: 768 });
    const sala = salaPorId('habitacion-recuperacion');
    mkdirSync(CARPETA, { recursive: true });
    const doble: Doble = { sala, salaInicial: sala, momento: 'noche', cerradas: {}, personas: null, junto: /kit/i };
    await hacerDeServidor(page, doble);
    await entrarALaPrimeraSala(page);
    await mapaPintado(page, sala);
    await page.waitForTimeout(3500);
    const lienzo = page.locator('app-game-world canvas').first();
    const antes = PNG.sync.read(await lienzo.screenshot());
    const respuesta = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/interactions/'), { timeout: 15_000 });
    await page.keyboard.press('e');
    await respuesta;
    await page.waitForTimeout(2500);
    const despues = PNG.sync.read(await lienzo.screenshot());
    let distintos = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < antes.height; y++) {
      for (let x = 0; x < antes.width; x++) {
        const i = (y * antes.width + x) * 4;
        if (antes.data[i] !== despues.data[i] || antes.data[i + 1] !== despues.data[i + 1] || antes.data[i + 2] !== despues.data[i + 2]) {
          distintos++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
    }
    console.log('[igual]', JSON.stringify({ distintos, caja: distintos ? [x0, y0, x1, y1] : null, total: antes.width * antes.height }));
    writeFileSync(path.join(CARPETA, 'v2-antes-revisar.png'), PNG.sync.write(antes));
    writeFileSync(path.join(CARPETA, 'v2-despues-revisar.png'), PNG.sync.write(despues));
  });

  test('una sala de 1920 px: la cámara la recorre de punta a punta', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const pasillo = salaPorId('pasillo');
    const ancha: Sala = { ...pasillo, estructura: { ...pasillo.estructura, ancho: 1920 }, entrada: { x: 960, y: 420 } };
    await empezar(page, ancha, 'dia');
    const input = createWorldInputDriver(page, 'keyboard');
    const [x0, , w] = zonaCaminable(ancha.encuadre, 1920);
    await input.moveBy('ArrowLeft', 1000);
    const izquierda = await readPlayerPosition(page);
    expect(izquierda.x).toBeLessThanOrEqual(x0 + 24);
    await page.waitForTimeout(700);
    await capturar(page, 'sala-1920-izquierda');
    await input.moveBy('ArrowRight', 1800);
    const derecha = await readPlayerPosition(page);
    expect(derecha.x).toBeGreaterThanOrEqual(x0 + w - 24);
    await page.waitForTimeout(700);
    await capturar(page, 'sala-1920-derecha');
  });

  // Cada sala del hospital vista en el juego real, de noche y de día, a los dos tamaños.
  for (const sala of SALAS) {
    for (const momento of ['noche', 'dia'] as const) {
      test(`sala ${sala.id} de ${momento}`, async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await empezar(page, sala, momento);
        await capturar(page, `${sala.id}-${momento}`);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(2500);
        await capturar(page, `${sala.id}-${momento}`);
      });
    }
  }
});

