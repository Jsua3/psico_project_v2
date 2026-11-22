import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page, type Response } from '@playwright/test';

import { readJson } from './support/api-bodies';
import { PROFESOR, apiToken, readEditor } from './support/case-fixtures';
import { guardado } from './support/autoria-flujo';
import { runAxe } from './support/quality-gates';
import { loginAs, waitForWorldReady } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * El editor de salas por piezas de punta a punta (bloque P4, Tarea 13) contra la pila real, sin dobles: la docente crea un
 * caso del hospital (sus salas ya vienen por piezas), abre la entrada de urgencias, mueve con el teclado la puerta hacia la
 * sala de espera hasta que se monta sobre otra pieza (OCL-14 en vivo, en la pieza y en «Por resolver en esta sala»), la
 * corrige con el teclado, ve que se guarda y que sigue ahí al recargar, y la ensaya: el juego recibe la misma sala, con la
 * puerta en su nueva posición. Axe sin infracciones serias en el editor de la sala, y capturas a 1366 × 768 y 1920 × 1080.
 *
 * Contra la pila de P4 (`.superpowers/scripts/levantar-p4.ps1`):
 *   E2E_BASE_URL=http://localhost:4389 npx playwright test e2e/autoria-sala-piezas.e2e.ts
 */
const CARPETA = process.env['P4_CAPTURAS']
  ?? path.resolve(__dirname, '..', '..', '..', '..', '.superpowers', 'noche-2026-11-14', 'capturas-p4');
const BLOQUEANTES = new Set(['serious', 'critical']);
const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SALA = 'entrada-urgencias';
const PUERTA = 'a-espera';

async function sinInfraccionesSerias(page: Page, estado: string): Promise<void> {
  const resultados = await runAxe(page, { tags: ETIQUETAS_WCAG, resultTypes: ['violations'], include: 'main' });
  const serias = resultados.violations.filter(v => v.impact != null && BLOQUEANTES.has(v.impact));
  const resumen = serias.map(v => `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.map(n => n.target.join(' ')).join('\n')}`).join('\n\n');
  expect(serias, `${estado}: Axe, infracciones serias\n${resumen}`).toEqual([]);
}

/** La sala por piezas se ve entera en su columna: sin desplazamiento horizontal (encajada al ancho). */
async function salaEntera(page: Page, ancho: number, alto: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: alto });
  await expect.poll(() => page.evaluate(() => {
    const columna = document.querySelector<HTMLElement>('.escenario.por-piezas')?.parentElement;
    return columna ? columna.scrollWidth - columna.clientWidth : -1;
  }), { message: `la sala entra en su columna a ${ancho} × ${alto}` }).toBeLessThanOrEqual(1);
}

async function capturar(page: Page, nombre: string, ancho: number, alto: number, completa = false): Promise<void> {
  await page.setViewportSize({ width: ancho, height: alto });
  await page.waitForTimeout(400);
  mkdirSync(CARPETA, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA, `${nombre}-${ancho}x${alto}.png`), fullPage: completa });
}

test.describe('editor de salas por piezas', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('@p4 mover una puerta con el teclado, ver la falta, corregirla, guardar, recargar y ensayar la misma sala', async ({ page, request }) => {
    test.setTimeout(scaled(420_000));

    // 1. La docente crea un caso del hospital con la idea de urgencias: sus salas llegan por piezas.
    await loginAs(page, PROFESOR);
    await page.goto('/portal/casos/nuevo');
    await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
    await page.getByRole('link', { name: 'Elegir este lugar: Hospital' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
    await page.getByRole('button', { name: 'Usar esta idea: Urgencias de noche' }).click();
    await page.getByLabel('Nombre del caso').fill(`Sala por piezas ${Date.now()}`);
    await page.getByRole('button', { name: /^Crear el caso(?: con estas salas)?$/ }).click();
    await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
    const casoId = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);

    // 2. Abre la sala de la entrada de urgencias y la puerta hacia la sala de espera.
    await page.goto(`/portal/casos/${casoId}/editor/sala/${SALA}`);
    const puerta = page.locator(`button.pieza-muro[data-pieza="${PUERTA}"]`);
    await expect(puerta).toBeVisible({ timeout: scaled(60_000) });
    await expect(puerta).toHaveAttribute('data-muro', 'fondo');
    await expect(puerta).not.toHaveAttribute('data-incumple', /.+/);
    const inicial = Number(await puerta.getAttribute('data-pos'));
    await salaEntera(page, 1920, 1080);
    await salaEntera(page, 1366, 768);
    await sinInfraccionesSerias(page, 'la sala por piezas recién abierta');
    await capturar(page, 'p4-sala-editor', 1366, 768, true);
    await capturar(page, 'p4-sala-editor', 1920, 1080, true);
    await page.setViewportSize({ width: 1366, height: 768 });

    // 3. Con el teclado la mueve hacia la derecha hasta que se monta sobre el gel del fondo: OCL-14 en vivo, en la lista de
    //    «Por resolver en esta sala» y en la pieza que la regla señala (la primera del par: el gel).
    const faltas = page.locator('section[aria-labelledby="faltas-sala"]');
    await puerta.focus();
    await expect(puerta).toBeFocused();
    // Las listas del panel dicen lo que la sala tiene (no la primera opción): la paleta del hospital y el destino de la puerta.
    await expect(page.locator('app-panel-de-estructura').getByLabel('Paleta')).toHaveValue('hospital');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('app-panel-de-estructura').getByLabel('Destino')).toHaveValue(/espera/);
    let pasos = 0;
    while (pasos < 20) {
      await page.keyboard.press('ArrowRight');
      pasos++;
      await page.waitForTimeout(200); // la revisión en vivo espera 100 ms a que se calme la edición
      if (/OCL-14/.test((await faltas.allTextContents()).join(' '))) break; // sin esperar a que exista la lista
    }
    await expect(faltas).toContainText(/OCL-14: .* se montan una sobre otra en el muro «fondo»/, { timeout: scaled(5_000) });
    expect(pasos, 'la puerta llega a montarse sobre otra pieza antes de 20 pasos').toBeLessThan(20);
    // Las dos piezas del par se marcan: la puerta que se movió y la que ya estaba.
    await expect(puerta).toHaveAttribute('data-incumple', /OCL-14/);
    await expect(page.locator('button.pieza-muro[data-incumple*="OCL-14"]')).toHaveCount(2);
    await expect(puerta).toBeFocused();
    await sinInfraccionesSerias(page, 'la sala con la puerta montada sobre otra pieza');
    await capturar(page, 'p4-sala-falta-ocl14', 1366, 768, true);
    await page.setViewportSize({ width: 1366, height: 768 });

    // 4. La corrige con el teclado: retrocede de a un paso hasta que la falta se va (la revisión en vivo puede verla un
    //    paso tarde, así que no se cuenta: se mira).
    await puerta.focus();
    for (let i = 0; i < pasos + 2 && await faltas.count() > 0; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(250);
    }
    await expect(faltas).toHaveCount(0, { timeout: scaled(5_000) });
    await expect(page.locator('button.pieza-muro[data-incumple]')).toHaveCount(0);
    const final = Number(await puerta.getAttribute('data-pos'));
    expect(final, 'la puerta quedó movida respecto de la plantilla').not.toBe(inicial);
    await guardado(page);

    // 5. Al recargar, la puerta sigue donde quedó: se guardó en el servidor.
    await page.reload();
    await expect(puerta).toBeVisible({ timeout: scaled(60_000) });
    await expect(puerta).toHaveAttribute('data-pos', String(final));
    await expect(puerta).not.toHaveAttribute('data-incumple', /.+/);

    // 5b. El plano del caso (Tarea 11): las seis salas por piezas del caso, todas con nombre y sin puertas rotas; un clic
    //     en una sala abre su editor.
    await page.goto(`/portal/casos/${casoId}/editor/plano`);
    await expect(page.getByRole('heading', { level: 1, name: 'Plano del caso' })).toBeVisible({ timeout: scaled(30_000) });
    const salasDelPlano = page.locator('app-plano-caso button.plano__sala');
    await expect(salasDelPlano).toHaveCount(6, { timeout: scaled(30_000) });
    await expect(page.locator('app-plano-caso g.rota')).toHaveCount(0);
    await sinInfraccionesSerias(page, 'el plano del caso');
    await capturar(page, 'p4-plano-caso', 1366, 768, true);
    await capturar(page, 'p4-plano-caso', 1920, 1080, true);
    await page.setViewportSize({ width: 1366, height: 768 });
    await salasDelPlano.filter({ hasText: /^Entrada de urgencias/ }).click();
    await page.waitForURL(new RegExp(`/editor/sala/${SALA}$`), { timeout: scaled(30_000) });
    await expect(puerta).toBeVisible({ timeout: scaled(60_000) });

    // 6. La ensaya desde esa escena: el juego recibe la misma sala por piezas, con la puerta en su posición nueva.
    const token = await apiToken(request, PROFESOR);
    const editor = await readEditor(request, token, casoId);
    const nodo = (editor['nodes'] as { id: number; key: string }[]).find(n => n.key === SALA);
    expect(nodo, `el caso trae la escena de la sala ${SALA}`).toBeTruthy();
    const mundos: Record<string, any>[] = [];
    const leerMundo = async (respuesta: Response) => {
      if (respuesta.request().method() !== 'GET' || !/\/world$/.test(new URL(respuesta.url()).pathname)) return;
      const cuerpo = await readJson(respuesta).catch(() => null);
      if (cuerpo?.data?.map) mundos.push(cuerpo.data);
    };
    page.on('response', leerMundo);
    await page.goto(`/portal/casos/${casoId}/ensayo?desde=${nodo!.id}`);
    await expect(page.locator('.game-container')).toHaveAttribute('data-rehearsal', 'true', { timeout: scaled(60_000) });
    await waitForWorldReady(page);
    await expect.poll(() => mundos.length, { timeout: scaled(30_000) }).toBeGreaterThan(0);
    page.off('response', leerMundo);
    const mundo = mundos[mundos.length - 1];
    expect(mundo['map']['structure'], 'el juego recibe la sala armada por piezas').toBeTruthy();
    const salida = (mundo['objects'] as Record<string, any>[]).find(o => o['type'] === 'EXIT' && o['key'] === PUERTA);
    expect(salida, `el juego recibe la puerta ${PUERTA}`).toBeTruthy();
    expect(salida!['metadata']['pos'], 'la puerta está donde la dejó la docente').toBe(final);
    await capturar(page, 'p4-sala-ensayo', 1366, 768);
    await capturar(page, 'p4-sala-ensayo', 1920, 1080);
  });
});
