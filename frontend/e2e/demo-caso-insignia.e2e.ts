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
  startFreshAttempt,
  waitForWorldReady,
  watchReaction,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Comprobación de la pila local de demostración (rama demo/local-k1, `.superpowers/scripts/levantar-demo.ps1`): el caso
 * insignia SIM-VBG-002, ya importado, publicado y asignado, se juega en el cliente del bloque B hasta la primera decisión
 * del capítulo 1. No crea ni borra datos: corre contra la pila viva (`E2E_BASE_URL`), no contra la pila de pruebas.
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

test.use({ viewport: { width: KEYBOARD.width, height: KEYBOARD.height } });

test('@demo-k1 SIM-VBG-002: entrar, caminar, hablar y tomar la primera decisión del capítulo 1', async ({ page }) => {
  test.setTimeout(scaled(300_000));
  mkdirSync(CAPTURAS, { recursive: true });
  const captura = (nombre: string) => page.screenshot({ path: join(CAPTURAS, nombre) });

  await entrarAlCaso(page);
  await expect(goalCard(page), 'la ficha trae el objetivo de la escena E01').toHaveAttribute('data-goal', /Mira qué está pasando en la entrada/);
  await page.waitForTimeout(800); // que el mundo termine de pintarse antes de la captura
  await captura('01-entrada-de-urgencias.png');

  // Caminar hasta la abuela (a la izquierda de la aparición) y hablar con ella.
  const input = createWorldInputDriver(page, 'keyboard');
  await reachNearby(page, input, ['ArrowLeft', 'ArrowLeft', 'ArrowDown'], /abuela/i);
  await interactNearby(page, /abuela/i, /\/interactions\/abuela$/);
  const abuela = page.getByRole('dialog', { name: /abuela/i });
  await expect(abuela, 'la abuela habla').toContainText('La niña venía con ella', { timeout: scaled(15_000) });
  await captura('02-conversacion-abuela.png');
  // Su conversación termina en «Aplicar PAP a la familia en crisis», que pide el kit PAP: se vuelve al mapa sin elegir.
  await abuela.getByRole('button', { name: /volver al mapa/i }).click();
  await expect(abuela).toBeHidden({ timeout: scaled(10_000) });

  // El vigilante ofrece la decisión 1; se elige la adecuada y el hermano mayor reacciona.
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], /vigilante/i);
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

  // Tras la reacción llega la nota de supervisión; al cerrarla el caso sigue en la escena siguiente (E02).
  const nota = page.getByRole('dialog', { name: /consecuencia/i });
  await expect(nota, 'la nota de supervisión llega tras la reacción').toBeVisible({ timeout: scaled(30_000) });
  await closeDialogue(page, /consecuencia/i);
  await expect(goalCard(page), 'la escena siguiente trae su propio objetivo').not.toHaveAttribute('data-goal', /Mira qué está pasando en la entrada/, { timeout: scaled(30_000) });
  await page.waitForTimeout(800);
  await captura('05-escena-siguiente.png');
});
