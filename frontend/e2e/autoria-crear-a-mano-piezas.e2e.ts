import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { PROFESOR, apiToken, readEditor } from './support/case-fixtures';
import { guardado } from './support/autoria-flujo';
import { readJson } from './support/api-bodies';
import { createWorldInputDriver, loginAs, nearbyAction, reachNearby, waitForWorldReady, waitUntilPlayerStill } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Crear un caso a mano arma las salas por piezas, igual que la generación con IA (V6): la docente elige el lugar y una idea
 * de salas, y el caso nace con las salas por piezas de la plantilla del lugar, sin faltas. En el editor la sala se ve con las
 * piezas, un mueble se mueve, se guarda y sigue ahí al recargar; el plano del caso no tiene puertas rotas; y en el ensayo el
 * jugador cruza la puerta de la primera sala a la segunda. Universidad y comisaría, a 1366 × 768, con capturas.
 *
 * Contra la pila de P4 (`.superpowers/scripts/levantar-p4.ps1`):
 *   E2E_BASE_URL=http://localhost:4389 npx playwright test e2e/autoria-crear-a-mano-piezas.e2e.ts
 */
const CARPETA = process.env['P4_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-p4', 'crear-a-mano-v6');

type Json = Record<string, any>;

interface Ruta {
  lugar: string;
  idea: string;
  /** La sala de inicio y la que sigue: la puerta del fondo de la primera lleva a la segunda. */
  primera: string;
  segunda: { id: string; nombre: string };
  /** El rótulo de la puerta en la barra del juego (el nombre del lugar al que lleva, o su acción). */
  puerta: RegExp;
  /** Cuántas salas trae la idea. */
  salas: number;
}

const RUTAS: Ruta[] = [
  { lugar: 'Universidad', idea: 'Atención en Bienestar', primera: 'pasillo', segunda: { id: 'sala-espera', nombre: 'Sala de espera de Bienestar' }, puerta: /Sala de espera de Bienestar/i, salas: 3 },
  { lugar: 'Comisaría de familia', idea: 'Primera atención', primera: 'fachada', segunda: { id: 'recepcion', nombre: 'Recepción' }, puerta: /Entrar a la comisaría/i, salas: 4 },
];

async function capturar(page: Page, nombre: string): Promise<void> {
  mkdirSync(CARPETA, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(CARPETA, `${nombre}-1366x768.png`) });
}

async function mundoDelEditor(request: APIRequestContext, token: string, casoId: number, nodo: number): Promise<Json> {
  const respuesta = await request.get(`/api/authoring/cases/${casoId}/world-editor?nodeId=${nodo}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(respuesta.ok(), `world-editor del nodo ${nodo}`).toBeTruthy();
  return (await respuesta.json()).data as Json;
}

test.describe('crear un caso a mano arma las salas por piezas', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const ruta of RUTAS) {
    test(`@p4 ${ruta.lugar}: crear a mano, ver y mover una pieza, guardar, reabrir, plano y cruzar una puerta en el ensayo`, async ({ page, request }) => {
      test.setTimeout(scaled(420_000));
      const prefijo = ruta.primera === 'pasillo' ? 'universidad' : 'comisaria';
      await loginAs(page, PROFESOR);

      // 1. Crear a mano: el lugar, una idea de salas y el nombre.
      await page.goto('/portal/casos/nuevo');
      await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
      // Las plantillas son radios (como el «Nuevo proyecto» de Unity Hub): se elige y «Continuar» lleva a las salas.
      await page.locator('label.plantilla').filter({ has: page.getByRole('radio', { name: ruta.lugar, exact: true }) }).click();
      await expect(page.getByRole('radio', { name: ruta.lugar, exact: true })).toBeChecked();
      await page.getByRole('link', { name: new RegExp(`^Elegir este lugar: ${ruta.lugar}`) }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
      // Con la IA de autoría encendida la pantalla abre en «Describe tu caso»; sin ella, ya está a mano.
      const aMano = page.getByRole('radio', { name: /^Elegir salas a mano/ });
      if (await aMano.count()) await page.locator('label.opcion').filter({ has: aMano }).click();
      await expect(page.getByRole('button', { name: `Usar esta idea: ${ruta.idea}` })).toBeVisible({ timeout: scaled(15_000) });
      await page.getByRole('button', { name: `Usar esta idea: ${ruta.idea}` }).click();
      await page.getByLabel('Nombre del caso').fill(`A mano por piezas ${prefijo} ${Date.now()}`);
      await page.getByRole('button', { name: /^Crear el caso(?: con estas salas)?$/ }).click();
      await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
      const casoId = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);

      // 2. Todas las salas nacieron por piezas.
      const token = await apiToken(request, PROFESOR);
      const nodos = (await readEditor(request, token, casoId))['nodes'] as { id: number; key: string }[];
      expect(nodos).toHaveLength(ruta.salas);
      for (const nodo of nodos) {
        const mundo = await mundoDelEditor(request, token, casoId, nodo.id);
        expect(mundo['map']['structure'], `la sala ${nodo.key} nace por piezas`).toBeTruthy();
      }

      // 3. La primera sala en el editor: dibujada con piezas y sin faltas.
      await page.goto(`/portal/casos/${casoId}/editor/sala/${ruta.primera}`);
      await expect(page.locator('app-lienzo-de-sala')).toHaveAttribute('data-lienzo', 'listo', { timeout: scaled(60_000) });
      await expect(page.locator('section[aria-labelledby="faltas-sala"]'), 'un caso recién creado no nace con faltas').toHaveCount(0);
      await capturar(page, `${prefijo}-sala-recien-creada`);

      // 4. Mover un mueble con los botones, guardar y ver que sigue ahí al recargar.
      const mueble = page.locator('button.pieza[data-elemento="mueble-0"]');
      await mueble.click();
      const antes = await mueble.evaluate(el => (el as HTMLElement).style.left);
      await page.getByRole('button', { name: 'Mover a la derecha' }).click();
      await page.getByRole('button', { name: 'Mover a la derecha' }).click();
      await expect.poll(() => mueble.evaluate(el => (el as HTMLElement).style.left)).not.toBe(antes);
      const movido = await mueble.evaluate(el => (el as HTMLElement).style.left);
      await guardado(page);
      await page.reload();
      await expect(page.locator('app-lienzo-de-sala')).toHaveAttribute('data-lienzo', 'listo', { timeout: scaled(60_000) });
      await expect.poll(() => page.locator('button.pieza[data-elemento="mueble-0"]').evaluate(el => (el as HTMLElement).style.left),
        { message: 'el mueble sigue donde se dejó al recargar' }).toBe(movido);
      await expect(page.locator('section[aria-labelledby="faltas-sala"]')).toHaveCount(0);
      await capturar(page, `${prefijo}-sala-mueble-movido`);

      // 5. El plano del caso: las salas y sus puertas, ninguna rota.
      await page.goto(`/portal/casos/${casoId}/editor/plano`);
      await expect(page.getByRole('heading', { level: 1, name: 'Plano del caso' })).toBeVisible({ timeout: scaled(30_000) });
      await expect(page.locator('app-plano-del-lugar button.plano__sala')).toHaveCount(ruta.salas);
      await expect(page.locator('app-plano-caso g.rota')).toHaveCount(0);
      await capturar(page, `${prefijo}-plano`);

      // 6. El ensayo: desde la primera sala, el jugador camina hasta la puerta del fondo y la cruza a la segunda.
      const inicio = nodos.find(n => n.key === ruta.primera)!;
      await page.goto(`/portal/casos/${casoId}/ensayo?desde=${inicio.id}`);
      await expect(page.locator('.game-container')).toHaveAttribute('data-rehearsal', 'true', { timeout: scaled(60_000) });
      // Sin la clave del mapa: `data-rendered-map-key` solo se publica al arrancar el juego y el ensayo cambia de mundo después.
      await waitForWorldReady(page);
      await capturar(page, `${prefijo}-ensayo-primera-sala`);
      const puerta = ruta.puerta;
      await reachNearby(page, createWorldInputDriver(page, 'keyboard'), 'ArrowUp', puerta);
      await waitUntilPlayerStill(page);
      const entrada = page.waitForResponse(r => r.request().method() === 'POST'
        && /\/api\/simulation\/attempts\/[^/]+\/enter-room$/.test(new URL(r.url()).pathname), { timeout: scaled(30_000) });
      await nearbyAction(page, puerta).click();
      const respuesta = await entrada;
      expect(respuesta.ok(), 'cruzar la puerta').toBeTruthy();
      expect(((await readJson(respuesta)).data as Json)['map']['key'], 'la puerta lleva a la segunda sala').toBe(`sala-${ruta.segunda.id}`);
      await waitForWorldReady(page);
      await page.waitForTimeout(1500);
      await capturar(page, `${prefijo}-ensayo-segunda-sala`);
    });
  }
});
