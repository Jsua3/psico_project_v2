import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  aprobarYPublicarPorApi, completarListaYEnviar, crearCasoBienestar, entrarALaPrimeraSala, escribirCasoBienestar, marcarPersonaAAtender,
} from './support/autoria-flujo';
import { assignCase, retireCase } from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import { measuresIn, measuresInText, recordSimulationResponses, retiredKeysIn, shapeOf } from './support/no-numbers';
import { loginAs } from './support/screen-tour';
import { chooseDecision, createWorldInputDriver, exploreUntilNearby, interactNearby, readPlayerPosition } from './support/siep-flow';
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

const atender = (nombre: string) => new RegExp(`${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*persona a atender`, 'i');

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

    // ── Se acerca a un objeto: anima, y el cuadro avanza ─────────────────────────────────────────────────────────
    const entrada = await readPlayerPosition(page);
    const entrada2 = createWorldInputDriver(page, 'keyboard');
    await exploreUntilNearby(page, entrada2, /buzón de bienestar|afiche de servicios de bienestar/i);
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
    expect(Number.isFinite(entrada.x) && Number.isFinite(entrada.y), 'se leyó la posición inicial del jugador').toBe(true);

    // ── La persona a atender habla y sus respuestas se pueden elegir (el guion cuelga de ella) ───────────────────────
    const nombre = new RegExp(persona.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    await exploreUntilNearby(page, entrada2, new RegExp(`hablar con ${nombre.source}`, 'i'));
    await interactNearby(page, new RegExp(`hablar con ${nombre.source}`, 'i'), /\/interactions\/[^/]+$/);
    const dialogo = page.getByRole('dialog', { name: nombre });
    await expect(dialogo).toContainText('Hola, ¿esta es la oficina de Bienestar?', { timeout: scaled(15_000) });
    await chooseDecision(page, nombre, /Sí, la sala de espera está aquí al lado/);
    await expect(page.locator('app-simulation-play').getByText('Escenario 2 de 3').first()).toBeVisible({ timeout: scaled(45_000) });

    // ── Ninguna cifra llegó al estudiante ────────────────────────────────────────────────────────────────────────
    const texto = await page.locator('app-simulation-play').first().innerText();
    expect(measuresInText(texto), 'lo que lee el estudiante en la sala no trae cifras de desempeño').toEqual([]);
    expect(retiredKeysIn(registro.records), 'ninguna clave del modelo numérico viejo llegó al navegador').toEqual([]);
    expect(measuresIn(registro.records).map((m) => `${shapeOf(m.where)} → ${m.key}=${m.value}`), 'ningún número que sea una medida llegó al navegador').toEqual([]);
  } finally {
    if (caseVersionId) await retireCase(request, caseVersionId, asignacion ? [asignacion] : []);
  }
});
