import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { resetStudentConsent } from './support/consent';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  finishCaseIntroduction,
  goalCard,
  interactNearby,
  leaveBrief,
  loginStudent,
  reachNearby,
  readPlayerPosition,
  startFreshAttempt,
  waitForWorldReady,
  watchReaction,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Comprobación de la pila local de demostración por piezas (rama demo/local-piezas,
 * `.superpowers/scripts/levantar-demo-piezas.ps1`): el caso insignia SIM-VBG-002, ya importado, publicado y asignado, se
 * juega en el cliente del bloque B, en las salas del hospital por piezas (P1, P2 y P3), por todo el capítulo 1. No crea ni borra datos: corre contra la pila viva (`E2E_BASE_URL`), no contra la pila de pruebas.
 * Las capturas van a `DEMO_CAPTURAS_DIR`.
 */
const TITULO = 'Violencia Familiar y Tentativa de Feminicidio';
const KEYBOARD = REQUIRED_VIEWPORTS[1];
const CAPTURAS = process.env['DEMO_CAPTURAS_DIR'] ?? join(process.cwd(), 'test-results', 'demo-capturas');

async function entrarAlCaso(page: Page): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await resetStudentConsent(page);
  await page.goto('/portal/simulador');
  // SIM-VBG-001 (el caso base) empieza con el mismo título: la tarjeta se elige por el código.
  const card = page.locator('.case-card').filter({ hasText: 'SIM-VBG-002' });
  await expect(card, 'SIM-VBG-002 está en el catálogo del estudiante').toBeVisible({ timeout: scaled(30_000) });
  await card.locator('.case-card__actions button').first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
  await leaveBrief(page);
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
  await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(30_000) });
  if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
  await expect(consent).toBeVisible({ timeout: scaled(30_000) });
  const intro = await acceptContentWarning(page, consent);
  const tarjeta = await finishCaseIntroduction(page, intro);
  await expect(tarjeta, 'la tarjeta «Antes de comenzar» nombra el caso').toContainText(TITULO);
  await tarjeta.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
}

type Mando = ReturnType<typeof createWorldInputDriver>;

/** Carril libre de muebles en las salas del hospital de P1: por él se cruza la sala de lado a lado. */
const CARRIL_Y = 440;

/**
 * Camina en lazo cerrado (moveBy, sobre data-player-x/y) hasta quedar debajo de (x, y): baja al carril, cruza en
 * horizontal y sube hasta 40 px bajo el objetivo. No usa empujones cortos alternando teclas: desde G1 el personaje gira
 * antes de caminar (50 ms por vista) y un empujón de 100 ms tras cambiar de tecla se va casi entero en el giro.
 * Las posiciones son las del documento del caso (constructor de SIM-VBG-002).
 */
async function caminarHasta(
  page: Page, input: Mando, x: number, y: number, quien: RegExp, alLado = 46, carril = CARRIL_Y,
): Promise<void> {
  // Con la máquina cargada, moveBy puede pasarse de largo: se corrige hasta quedar a menos de 6 px (o contra un mueble).
  const ir = async (eje: 'x' | 'y', destino: number) => {
    for (let intento = 0; intento < 4; intento += 1) {
      const p = await readPlayerPosition(page);
      const d = destino - p[eje];
      if (Math.abs(d) < 6) return;
      const tecla = eje === 'x' ? (d < 0 ? 'ArrowLeft' : 'ArrowRight') : (d < 0 ? 'ArrowUp' : 'ArrowDown');
      await input.moveBy(tecla, Math.abs(d));
      const q = await readPlayerPosition(page);
      if (Math.abs(q[eje] - p[eje]) < 2) return;   // no avanzó: un mueble o el muro; seguir así
    }
  };
  // Se para AL LADO (a la derecha) y casi a su altura: delante taparía a la persona en la captura.
  await ir('y', carril);
  await ir('x', x + alLado);
  await ir('y', Math.min(CARRIL_Y, y + (alLado ? 12 : 40)));
  await reachNearby(page, input, ['ArrowUp'], quien);
}

/** Tras elegir: la nota de supervisión llega después de la reacción; al cerrarla, la ficha trae el objetivo nuevo. */
async function cerrarNotaYEsperar(page: Page, objetivoNuevo: RegExp): Promise<void> {
  const nota = page.getByRole('dialog', { name: /consecuencia/i });
  await expect(nota, 'la nota de supervisión llega tras la reacción').toBeVisible({ timeout: scaled(30_000) });
  await closeDialogue(page, /consecuencia/i);
  await expect(goalCard(page), `la escena siguiente trae su objetivo (${objetivoNuevo})`)
    .toHaveAttribute('data-goal', objetivoNuevo, { timeout: scaled(30_000) });
}

/** Camina hasta `quien`, abre su conversación, espera la opción (las opciones aparecen escalonadas), captura y elige. */
async function decidir(
  page: Page, input: Mando, quien: RegExp, clave: string, donde: [number, number], opcion: RegExp,
  captura: () => Promise<unknown>, alLado = 46, carril = CARRIL_Y,
): Promise<void> {
  await caminarHasta(page, input, donde[0], donde[1], quien, alLado, carril);
  await interactNearby(page, quien, new RegExp(`/interactions/${clave}$`));
  const dialogo = await advanceDialogueToChoices(page, quien);
  await expect(dialogo.getByRole('button', { name: opcion }), `${quien} ofrece la opción adecuada`).toBeVisible({ timeout: scaled(10_000) });
  await page.waitForTimeout(1_000);
  await captura();
  await chooseDecision(page, quien, opcion);
}

/** Habla con alguien sin decidir (su conversación no tiene opciones): lee y cierra. */
async function hablar(
  page: Page, input: Mando, quien: RegExp, clave: string, donde: [number, number], alLado = 46, carril = CARRIL_Y,
): Promise<void> {
  await caminarHasta(page, input, donde[0], donde[1], quien, alLado, carril);
  await interactNearby(page, quien, new RegExp(`/interactions/${clave}$`));
  await closeDialogue(page, quien);
}

test.use({ viewport: { width: KEYBOARD.width, height: KEYBOARD.height } });

test('@demo-k1 @demo-piezas SIM-VBG-002: entrar, caminar, hablar y jugar los tres capítulos (dieciséis decisiones)', async ({ page }) => {
  test.setTimeout(scaled(600_000));
  mkdirSync(CAPTURAS, { recursive: true });
  const captura = (nombre: string) => page.screenshot({ path: join(CAPTURAS, nombre) });

  await entrarAlCaso(page);
  await expect(goalCard(page), 'la ficha trae el objetivo de la escena E01').toHaveAttribute('data-goal', /Mira qué está pasando en la entrada/);
  await page.waitForTimeout(800); // que el mundo termine de pintarse antes de la captura
  await captura('01-entrada-de-urgencias.png');

  // Caminata en diagonal (G1): arriba e izquierda a la vez; la captura sale con el personaje en tres cuartos de espalda.
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(450);
  await captura('01b-caminata-en-diagonal.png');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');

  // Caminar hasta la abuela (a la derecha de la aparición, junto a las sillas de ruedas) y hablar con ella.
  const input = createWorldInputDriver(page, 'keyboard');
  await caminarHasta(page, input, 860, 400, /abuela/i);
  await interactNearby(page, /abuela/i, /\/interactions\/abuela$/);
  const abuela = page.getByRole('dialog', { name: /abuela/i });
  await expect(abuela, 'la abuela habla').toContainText('La niña venía con ella', { timeout: scaled(15_000) });
  await captura('02-conversacion-abuela.png');
  // Su conversación termina en «Aplicar PAP a la familia en crisis», que pide el kit PAP: se vuelve al mapa sin elegir.
  await abuela.getByRole('button', { name: /volver al mapa/i }).click();
  await expect(abuela).toBeHidden({ timeout: scaled(10_000) });

  // El vigilante ofrece la decisión 1; se elige la adecuada y el hermano mayor reacciona.
  await caminarHasta(page, input, 300, 320, /vigilante/i);
  await interactNearby(page, /vigilante/i, /\/interactions\/vigilante$/);
  const dialogo = await advanceDialogueToChoices(page, /vigilante/i);
  await expect(dialogo.getByRole('button', { name: /mirar primero/i }), 'la opción adecuada de la decisión 1').toBeVisible();
  // Las tres opciones de la decisión 1 (ninguna pide requisito); aparecen escalonadas, así que la captura espera a la última.
  const opciones = dialogo.getByRole('group', { name: /opciones de intervención/i }).getByRole('button');
  await expect(opciones, 'el vigilante ofrece las tres opciones de la decisión 1').toHaveCount(3);
  await expect(opciones.nth(2)).toContainText(/retire al hermano/i);
  await page.waitForTimeout(1_000);
  await captura('03-decision-1.png');
  const reacciones = await watchReaction(page);
  const decision = await chooseDecision(page, /vigilante/i, /mirar primero/i);
  expect(decision.reaction, 'el servidor trae la reacción del hermano mayor').toMatchObject({ gesture: 'se-acerca', objectKey: 'hermano-mayor' });
  const franja = page.locator('app-reaction-director .reaction-strip');
  await expect(franja, 'la franja dice la frase del hermano').toContainText('Yo soy el hermano', { timeout: scaled(5_000) });
  await captura('04-reaccion-del-hermano.png');
  await expect.poll(reacciones, { message: 'el gesto se puso en el host', timeout: scaled(5_000) }).toContain('se-acerca');

  // Tras la reacción llega la nota de supervisión; al cerrarla el caso sigue en la escena 2 (sala de espera).
  await cerrarNotaYEsperar(page, /Entiende qué está viviendo la familia/);
  await page.waitForTimeout(800);
  await captura('05-escena-siguiente.png');

  // Decisión 2 (sala de espera): la abuela ofrece contener antes de informar.
  await decidir(page, input, /abuela/i, 'abuela', [640, 330], /contención emocional/i,
    () => captura('06-decision-2.png'));
  await cerrarNotaYEsperar(page, /Busca un lugar donde la familia pueda hablar/);

  // Decisión 3 (un lugar para hablar): la sala de escucha pide haber hablado antes con la enfermera.
  await hablar(page, input, /enfermera/i, 'enfermera', [1110, 330]);
  await decidir(page, input, /abuela/i, 'abuela', [640, 330], /la sala de escucha/i,
    () => captura('07-decision-3.png'));
  await cerrarNotaYEsperar(page, /Aclara con el equipo médico/);

  // Decisión 4 (estación de enfermería): acordar con el médico pide haber revisado la hoja de ingreso.
  await caminarHasta(page, input, 470, 440, /hoja de ingreso/i, 0);
  await interactNearby(page, /hoja de ingreso/i, /\/interactions\/hoja-ingreso$/);
  const hoja = page.getByRole('dialog', { name: /hoja de ingreso/i });
  if (await hoja.isVisible({ timeout: scaled(2_000) }).catch(() => false)) await closeDialogue(page, /hoja de ingreso/i);
  await decidir(page, input, /médico de guardia/i, 'medico-guardia', [800, 410], /acordar qué está confirmado/i,
    () => captura('08-decision-4.png'));
  const nota = page.getByRole('dialog', { name: /consecuencia/i });
  await expect(nota, 'la nota de supervisión de la decisión 4').toBeVisible({ timeout: scaled(30_000) });
  await closeDialogue(page, /consecuencia/i);
  await expect(goalCard(page), 'el capítulo 2 trae su propio objetivo')
    .not.toHaveAttribute('data-goal', /Aclara con el equipo médico/, { timeout: scaled(30_000) });
  await page.waitForTimeout(800);
  await captura('09-capitulo-2.png');

  // ── Capítulo 2 · La noticia ──────────────────────────────────────────────────────────────────────────────────────
  // Las posiciones son las del documento del caso. Quien está detrás de un mueble se aborda de frente (alLado = 0) o
  // por el lado libre (negativo: a su izquierda).
  // Decisión 5 (O2, trabajo social): la trabajadora social, detrás de su escritorio.
  await expect(goalCard(page)).toHaveAttribute('data-goal', /Ubica qué te exige la norma en salud/, { timeout: scaled(30_000) });
  await decidir(page, input, /trabajadora social/i, 'trabajadora-social', [480, 290], /459 de 2012 \+ Ley 1257/i,
    () => captura('10-decision-5-trabajo-social.png'), 0);
  await cerrarNotaYEsperar(page, /Decide cómo actuar con la familia con criterio técnico y ético/);

  // Decisión 6 (O3, sala de escucha): la psicóloga, junto a la mesa de centro.
  await decidir(page, input, /psicóloga/i, 'psicologa-hospital', [660, 290], /evaluación psicosocial familiar/i,
    () => captura('11-decision-6-sala-de-escucha.png'), -46);
  await cerrarNotaYEsperar(page, /Averigua qué sabe la familia/);

  // Decisión 7 (N4): la abuela, antes de la noticia.
  await decidir(page, input, /abuela/i, 'abuela', [330, 360], /preguntar qué saben/i,
    () => captura('12-decision-7-antes-de-decir.png'));
  await cerrarNotaYEsperar(page, /Acompaña la reacción de la abuela/);

  // Decisión 8 (N5): la abuela, después de la noticia.
  await decidir(page, input, /abuela/i, 'abuela', [330, 360], /guardar silencio/i,
    () => captura('13-decision-8-tras-el-silencio.png'));
  await cerrarNotaYEsperar(page, /Ayuda a la familia a saber qué sigue esta noche/);

  // Decisión 9 (N6, pasillo): la mejor respuesta pide haber hablado antes con la trabajadora social.
  await hablar(page, input, /trabajadora social/i, 'trabajadora-social', [600, 330]);
  await decidir(page, input, /hermano mayor/i, 'hermano-mayor', [840, 360], /resumir la noche/i,
    () => captura('14-decision-9-pasillo.png'));
  await cerrarNotaYEsperar(page, /Acompáñala sin mentir/);

  // Decisión 10 (N7, recuperación): la mejor respuesta pide el acuerdo con el médico de la decisión 4.
  await decidir(page, input, /sobreviviente/i, 'sobreviviente', [430, 360], /no mentir ni improvisar/i,
    () => captura('15-decision-10-recuperacion.png'));
  await cerrarNotaYEsperar(page, /Valora el riesgo y define a dónde debe seguir la atención/);
  await page.waitForTimeout(800);
  await captura('16-capitulo-3.png');

  // ── Capítulo 3 · Quince días después (Comisaría de Familia, salas de imagen fija de la biblioteca) ─────────────────
  // Decisión 11 (O4, recepción): la sobreviviente, abordada por su izquierda (su madre está a su derecha).
  await decidir(page, input, /sobreviviente/i, 'sobreviviente', [480, 400], /valorar riesgo de feminicidio \+ medidas/i,
    () => captura('17-decision-11-recepcion.png'), -46);
  await cerrarNotaYEsperar(page, /Valora el riesgo sin hacerle contar de nuevo/);

  // Decisión 12 (N8, consultorio): la mejor respuesta pide haber leído el informe del hospital, que está en el escritorio.
  await caminarHasta(page, input, 670, 282, /informe/i, 0);
  await interactNearby(page, /informe/i, /\/interactions\/informe-hospital$/);
  const informe = page.getByRole('dialog', { name: /informe/i });
  if (await informe.isVisible({ timeout: scaled(2_000) }).catch(() => false)) await closeDialogue(page, /informe/i);
  await decidir(page, input, /sobreviviente/i, 'sobreviviente', [260, 410], /partir del informe/i,
    () => captura('18-decision-12-sin-repetir-la-herida.png'));
  await cerrarNotaYEsperar(page, /Identifica qué derechos hay que restablecer/);

  // Decisión 13 (O5, consultorio): la profesional psicosocial.
  await decidir(page, input, /profesional psicosocial/i, 'profesional-psicosocial', [520, 350], /Ley 2126 de 2021/i,
    () => captura('19-decision-13-marco.png'));
  await cerrarNotaYEsperar(page, /Explícale quién hace qué en la comisaría/);

  // Decisión 14 (N9, pasillo): antes, hablar con la orientadora jurídica y con la comisaria. Las sillas del pasillo
  // tapan y = 440: se cruza por y = 380.
  await hablar(page, input, /orientadora/i, 'orientadora-juridica', [160, 290], 46, 380);
  await hablar(page, input, /comisaria/i, 'comisaria', [340, 290], 46, 380);
  await decidir(page, input, /sobreviviente/i, 'sobreviviente', [300, 380], /explicarle quién hace qué/i,
    () => captura('20-decision-14-pasillo.png'), 46, 380);
  await cerrarNotaYEsperar(page, /Mira más allá de ella/);

  // Decisión 15 (N10, sala de espera): la madre.
  await decidir(page, input, /abuela|madre/i, 'abuela', [420, 420], /quién vive con ella/i,
    () => captura('21-decision-15-sala-de-espera.png'));
  await cerrarNotaYEsperar(page, /Define la actuación de protección y cierra la atención/);

  // Decisión 16 (O6, consultorio): el cierre. La escena siguiente es el final del caso.
  await decidir(page, input, /profesional psicosocial/i, 'profesional-psicosocial', [520, 350], /nivel de vulneración/i,
    () => captura('22-decision-16-cierre.png'));
  const notaFinal = page.getByRole('dialog', { name: /consecuencia/i });
  if (await notaFinal.isVisible({ timeout: scaled(30_000) }).catch(() => false)) await closeDialogue(page, /consecuencia/i);
  await page.waitForTimeout(3_000);
  await captura('23-final.png');
});
