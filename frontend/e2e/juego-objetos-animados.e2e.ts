import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  aprobarYPublicarPorApi, completarListaYEnviar, crearCasoBienestar, entrarALaPrimeraSala, escribirCasoBienestar, hacerQueVayaYVenga,
  marcarPersonaAAtender,
} from './support/autoria-flujo';
import { ADMIN, apiToken, assignCase, bearer, retireCase } from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import { measuresIn, measuresInText, recordSimulationResponses, retiredKeysIn, shapeOf } from './support/no-numbers';
import type { RecordedResponse } from './support/no-numbers';
import { loginAs } from './support/screen-tour';
import {
  chooseDecision, createWorldInputDriver, interactNearby, nearbyAction, readPlayerPosition, waitForWorldReady,
} from './support/siep-flow';
import type { WorldInputDriver } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Lo que un estudiante ve de un caso hecho en el editor nuevo (P6, tarea 8), contra el servidor REAL: la docente crea el caso
 * desde la universidad, lo escribe, marca en la sala del editor a una persona como «a quien atender» y lo envía; Psicología lo aprueba; el
 * estudiante juega su primera sala. Ahí:
 *
 * - un objeto con animación de cercanía NO anima mientras está lejos (cuadro 0), anima cuando es el candidato principal
 *   (el jugador está a menos de 74 px) y vuelve al cuadro 0 al alejarse. El juego publica `data-proximity` en su host
 *   (qué objeto anima y el cuadro de cada uno), igual que `data-player-x/y`: la animación vive en el lienzo de Phaser;
 * - la persona clave está en la lista accesible «Ir a…» con el texto «persona a atender», y el juego publica en su host
 *   (`data-key-person`) el nombre que lleva su chevrón sobre la cabeza (el dibujo vive en el lienzo y se revisa a ojo);
 * - la persona a atender, a la que la docente le pidió que «vaya y venga», camina de verdad (el juego publica su posición viva en
 *   `data-key-person-x/y`, igual que la del jugador) y, con «reducir movimiento» del sistema, queda quieta en su sitio;
 * - la persona clave habla (el guion de la escena cuelga de ella) y sus respuestas se pueden elegir: la elegida lleva a la
 *   segunda escena;
 * - ninguna cifra llega al estudiante: ni en lo que lee ni en lo que recibe del servidor (la regla de la Tarea 17).
 */
interface Proximidad { playing: string | null; frames: Record<string, number> }

const anfitrion = (page: Page) => page.locator('app-game-world .phaser-host');

/** Lo que el juego publica de las animaciones de cercanía; `null` mientras no haya ningún objeto con hoja. */
async function proximidad(page: Page): Promise<Proximidad | null> {
  const crudo = await anfitrion(page).getAttribute('data-proximity');
  return crudo === null ? null : (JSON.parse(crudo) as Proximidad);
}

/** Dónde está ahora la persona a atender (`data-key-person-x/y` del host); `null` si el juego aún no la publica. */
async function posicionDePersonaClave(page: Page): Promise<{ x: number; y: number } | null> {
  const [x, y] = await anfitrion(page).evaluate((el) => [el.getAttribute('data-key-person-x'), el.getAttribute('data-key-person-y')]);
  return x === null || y === null ? null : { x: Number(x), y: Number(y) };
}

const atender = (nombre: string) => new RegExp(`${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*persona a atender`, 'i');

interface Punto { x: number; y: number }
interface ObjetoDelMundo extends Punto { label: string; height: number }

/**
 * Los objetos de la sala que se llaman `etiqueta`, del más cercano al más lejano, con su posición REAL: la del mundo que el
 * servidor le mandó al estudiante (el último `GET …/world` que registró `recordSimulationResponses`). El juego pone el
 * marcador del objeto en (x, y) y ofrece la interacción a menos de 74 px de ese punto (MARKER_INTERACT_RADIUS).
 */
function objetosDelMundo(registros: readonly RecordedResponse[], etiqueta: RegExp, desde: Punto): { cerca: ObjetoDelMundo[]; todos: string[] } {
  const mundo = [...registros].reverse().find((r) => /^GET \/api\/simulation\/attempts\/[^/]+\/world$/.test(r.where));
  const objetos = (mundo?.body as { data?: { objects?: ObjetoDelMundo[] } } | undefined)?.data?.objects ?? [];
  const cerca = objetos.filter((o) => etiqueta.test(o.label))
    .sort((a, b) => Math.hypot(a.x - desde.x, a.y - desde.y) - Math.hypot(b.x - desde.x, b.y - desde.y));
  return { cerca, todos: objetos.map((o) => `${o.label} (${o.x}, ${o.y})`) };
}

/**
 * Camina en lazo cerrado (`moveBy`) hasta un punto conocido y se detiene en cuanto la barra ofrece `etiqueta`: primero en
 * horizontal y luego en vertical; si algo cierra el paso, en el otro orden. Sin barrido a ciegas: con WebGL por software
 * el barrido no cubre la sala en su plazo (se quedaba siempre en la esquina derecha, en 919, 252).
 */
async function caminarHasta(page: Page, entrada: WorldInputDriver, destino: Punto, etiqueta: RegExp): Promise<void> {
  const accion = nearbyAction(page, etiqueta);
  const cerca = () => accion.isVisible().catch(() => false);
  for (const orden of [['x', 'y'], ['y', 'x'], ['x', 'y']] as const) {
    for (const eje of orden) {
      if (await cerca()) return;
      const ahora = await readPlayerPosition(page);
      const delta = eje === 'x' ? destino.x - ahora.x : destino.y - ahora.y;
      if (Math.abs(delta) <= 4) continue;
      const tecla = eje === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await entrada.moveBy(tecla, Math.abs(delta)).catch(() => undefined);
    }
  }
  const al = await readPlayerPosition(page);
  await expect(accion, `caminando hasta (${destino.x}, ${destino.y}) no apareció ${etiqueta} (jugador en ${al.x}, ${al.y})`)
    .toBeVisible({ timeout: scaled(5_000) });
}

// req: RF-12, RNF-004
test('un estudiante juega la primera sala de un caso hecho en el editor: el objeto anima al acercarse y vuelve al reposo, y la persona a atender se resalta', async ({ page, request }) => {
  test.setTimeout(scaled(600_000));
  await page.setViewportSize({ width: 1366, height: 800 });
  let caseVersionId = 0;
  let asignacion: AssignmentRecord | undefined;
  try {
    // ── La docente hace el caso ──────────────────────────────────────────────────────────────────────────────────
    await loginAs(page, 'profesor');
    caseVersionId = await crearCasoBienestar(page, `Objetos animados e2e ${Date.now()}`);
    await escribirCasoBienestar(page);
    const persona = await marcarPersonaAAtender(page);
    await hacerQueVayaYVenga(page); // la persona que quedó elegida en la sala va y viene hasta un punto que la docente fijó
    await completarListaYEnviar(page);

    // ── Psicología lo aprueba y se asigna al grupo del estudiante ────────────────────────────────────────────────
    await aprobarYPublicarPorApi(request, caseVersionId);
    asignacion = await assignCase(request, caseVersionId);

    // ── El estudiante entra a la primera sala ────────────────────────────────────────────────────────────────────
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    const registro = recordSimulationResponses(page);
    await entrarALaPrimeraSala(page);
    const titulo = await page.locator('app-simulation-play').first().innerText();
    expect(measuresInText(titulo), 'el estudiante no lee cifras de desempeño al entrar a la sala').toEqual([]);

    // Los objetos con hoja de cercanía están en la sala, quietos y en el cuadro 0.
    await expect.poll(() => proximidad(page), { timeout: scaled(45_000), message: 'el juego publicó las animaciones de la sala' }).not.toBeNull();
    const reposo = (await proximidad(page))!;
    const objetos = Object.keys(reposo.frames);
    expect(objetos.length, 'la sala trae al menos dos objetos con animación de cercanía').toBeGreaterThanOrEqual(2);
    expect(reposo.playing, 'lejos de todo, ninguno anima').toBeNull();
    expect(Object.values(reposo.frames), 'todos en el cuadro 0').toEqual(objetos.map(() => 0));

    // La persona clave está en la lista accesible, con el texto «persona a atender» (no solo con color o forma).
    const acceso = page.locator('button[data-hud-places]');
    await acceso.focus();
    await page.keyboard.press('Enter');
    const lista = page.getByRole('dialog', { name: /ir a…/i });
    await expect(lista).toBeVisible();
    await expect(lista.getByRole('button', { name: atender(persona) }), `${persona} aparece como persona a atender`).toBeVisible();
    await expect(lista.locator('.places__note')).toHaveCount(1);
    await expect(lista.locator('.places__note')).toHaveText('persona a atender');
    await page.keyboard.press('Escape');
    await expect(lista).toBeHidden();
    // El chevrón con su nombre sobre la cabeza: el juego publica el nombre que lleva, como `data-proximity`.
    await expect(anfitrion(page)).toHaveAttribute('data-key-person', persona, { timeout: scaled(15_000) });

    // ── La persona a atender «va y viene»: camina de verdad ─────────────────────────────────────────────────────────
    await expect.poll(() => posicionDePersonaClave(page), { timeout: scaled(15_000), message: 'el juego publicó dónde está la persona a atender' }).not.toBeNull();
    const origen = (await posicionDePersonaClave(page))!;
    let masLejos = 0;
    await expect.poll(async () => {
      const ahora = await posicionDePersonaClave(page);
      if (ahora) masLejos = Math.max(masLejos, Math.hypot(ahora.x - origen.x, ahora.y - origen.y));
      return masLejos;
    }, { timeout: scaled(40_000), intervals: [200], message: 'la persona a atender se aleja de donde empezó (va y viene)' }).toBeGreaterThan(30);

    // ── Se acerca a un objeto: anima, y el cuadro avanza ─────────────────────────────────────────────────────────
    const entrada2 = createWorldInputDriver(page, 'keyboard');
    const objetoCercano = /buzón de bienestar|afiche de servicios de bienestar/i;
    await registro.settled();
    const { cerca: candidatos, todos } = objetosDelMundo(registro.records, objetoCercano, await readPlayerPosition(page));
    expect(candidatos.length, `el mundo del estudiante trae el buzón o el afiche; trae: ${todos.join(' · ')}`).toBeGreaterThan(0);
    // Se para debajo del objeto, fuera de su caja (pegada a la pared) y dentro de los 74 px de alcance.
    const objeto = candidatos[0];
    await caminarHasta(page, entrada2, { x: objeto.x, y: objeto.y + Math.min(Math.round(objeto.height / 2) + 20, 56) }, objetoCercano);
    await expect.poll(async () => (await proximidad(page))?.playing ?? null, { timeout: scaled(15_000), message: 'el objeto cercano anima' }).not.toBeNull();
    const cercano = (await proximidad(page))!.playing!;
    expect(objetos, 'el que anima es uno de los de la sala').toContain(cercano);
    const cuadros = new Set<number>();
    await expect.poll(async () => {
      const ahora = await proximidad(page);
      if (ahora?.playing === cercano) cuadros.add(ahora.frames[cercano]);
      return cuadros.size;
    }, { timeout: scaled(30_000), intervals: [120], message: 'la animación recorre más de un cuadro' }).toBeGreaterThanOrEqual(2);
    const otros = Object.entries((await proximidad(page))!.frames).filter(([clave]) => clave !== cercano);
    expect(otros.map(([, cuadro]) => cuadro), 'los demás objetos siguen en el cuadro 0').toEqual(otros.map(() => 0));

    // ── Se aleja: vuelve al cuadro 0 y queda quieto ──────────────────────────────────────────────────────────────
    const desde = await readPlayerPosition(page);
    for (const rumbo of ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp'] as const) {
      await entrada2.moveBy(rumbo, 220);
      if ((await proximidad(page))?.playing === null) break;
    }
    await expect.poll(async () => { const ahora = await proximidad(page); return ahora ? ahora.playing : 'sin datos'; }, { timeout: scaled(15_000), message: 'al alejarse deja de animar' }).toBeNull();
    await expect.poll(async () => (await proximidad(page))?.frames[cercano], { timeout: scaled(10_000), message: 'y vuelve al cuadro 0' }).toBe(0);
    const hasta = await readPlayerPosition(page);
    expect(Math.hypot(hasta.x - desde.x, hasta.y - desde.y), 'el jugador se movió de verdad').toBeGreaterThan(40);

    // ── Con «reducir movimiento» del sistema, la persona a atender queda quieta en su sitio ─────────────────────────────
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    // Un caso del editor no trae escenario con nombre (`data-rendered-scenario-key` vacío): se espera al mundo, sin comparar la clave.
    const continuar = page.getByRole('button', { name: /continuar intento en progreso/i });
    await expect(continuar).toBeVisible({ timeout: scaled(30_000) });
    await continuar.click();
    await waitForWorldReady(page);
    await expect.poll(() => posicionDePersonaClave(page), { timeout: scaled(15_000), message: 'el juego volvió a publicar dónde está la persona a atender' }).not.toBeNull();
    const quieta = (await posicionDePersonaClave(page))!;
    for (let lectura = 0; lectura < 16; lectura++) {
      await page.waitForTimeout(500); // 8 s: de sobra para que, sin la preferencia, ya hubiera echado a andar (pausa de 1 a 3 s)
      expect(await posicionDePersonaClave(page), `lectura ${lectura + 1}: la persona a atender sigue en su sitio`).toEqual(quieta);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // ── La persona a atender habla y sus respuestas se pueden elegir (el guion cuelga de ella) ───────────────────────
    const nombre = new RegExp(persona.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Quieta en su sitio (reducir movimiento): se camina hasta la posición que publica el juego, a su lado (72 px de alcance).
    await caminarHasta(page, entrada2, { x: quieta.x, y: quieta.y + 40 }, new RegExp(`hablar con ${nombre.source}`, 'i'));
    await interactNearby(page, new RegExp(`hablar con ${nombre.source}`, 'i'), /\/interactions\/[^/]+$/);
    const dialogo = page.getByRole('dialog', { name: nombre });
    await expect(dialogo).toContainText('Hola, ¿esta es la oficina de Bienestar?', { timeout: scaled(15_000) });
    await chooseDecision(page, nombre, /Sí, la sala de espera está aquí al lado/);
    // El bloque B retiró el contador «Escenario k de n» (el número de pasos lo decide la docente): la barra nombra la escena.
    const admin = await apiToken(request, ADMIN);
    const escenas = ((await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(admin) })).json()).data as { nodes: Array<{ title: string }> }).nodes;
    await expect(page.locator('app-simulation-play').getByText(escenas[1].title, { exact: true }).first(),
      'la barra nombra la segunda escena del caso').toBeVisible({ timeout: scaled(45_000) });

    // ── Ninguna cifra llegó al estudiante ────────────────────────────────────────────────────────────────────────
    const texto = await page.locator('app-simulation-play').first().innerText();
    expect(measuresInText(texto), 'lo que lee el estudiante en la sala no trae cifras de desempeño').toEqual([]);
    expect(retiredKeysIn(registro.records), 'ninguna clave del modelo numérico viejo llegó al navegador').toEqual([]);
    expect(measuresIn(registro.records).map((m) => `${shapeOf(m.where)} → ${m.key}=${m.value}`), 'ningún número que sea una medida llegó al navegador').toEqual([]);
  } finally {
    if (caseVersionId) await retireCase(request, caseVersionId, asignacion ? [asignacion] : []);
  }
});
