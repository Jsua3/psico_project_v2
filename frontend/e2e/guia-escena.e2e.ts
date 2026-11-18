import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { PROFESOR, apiToken, send } from './support/case-fixtures';
import { createWorldInputDriver, exploreUntilNearby, loginAs, waitForWorldReady } from './support/siep-flow';

/**
 * La guía de la escena en el caso insignia (U1, V7; para las primeras testers): la ficha «Objetivo de la escena» arranca
 * abierta con el siguiente paso concreto («Habla con …») y su cuenta, y pasa al siguiente en el acto tras cada paso. En la
 * escena 1 se cumplen dos pasos; la escena 2 se abre con el panel de autora (el ensayo) y la ficha vuelve a abrirse con el
 * objetivo nuevo, y se cumple uno más. SIM-VBG-002 se importa como la docente (la pila de CI no lo trae en el catálogo).
 * Con GUIA_CAPTURAS=<carpeta>, quedan las capturas del inicio y tras el primer paso a 1920 × 1070.
 */
const DOC = JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-002.dsl.json'), 'utf-8'));

type Conductor = ReturnType<typeof createWorldInputDriver>;

async function cumplirPaso(page: Page, driver: Conductor, paso: Locator): Promise<string> {
  const texto = (await paso.textContent())?.trim() ?? '';
  const nombre = /^Habla con (.+)$/.exec(texto)?.[1] ?? '';
  expect(nombre, `el paso es hablar con alguien: «${texto}»`).not.toBe('');
  const quien = new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  await exploreUntilNearby(page, driver, quien, 90_000);
  // La acción con nombre de la barra de contexto: con varias personas cerca, la tecla E podía hablar con otra.
  await page.locator('button.context-bar__interaction').filter({ hasText: quien }).first().click();
  const cuadro = page.locator('.dialogue-strip');
  await expect(cuadro).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.locator('.dialogue-strip .panel-back').first().click();
  await expect(cuadro).toBeHidden({ timeout: 10_000 });
  await expect.poll(async () => (await paso.textContent())?.trim(), {
    message: `tras hablar con ${nombre}, la ficha pasa al siguiente paso`, timeout: 15_000,
  }).not.toBe(texto);
  return texto;
}

test('@guia-escena la ficha dice el siguiente paso y avanza tras cada uno (SIM-VBG-002, escenas 1 y 2)', async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  const contexto = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1920, height: 1070 } });
  const page = await contexto.newPage();
  const carpeta = process.env['GUIA_CAPTURAS'];
  try {
    const token = await apiToken(contexto.request, PROFESOR);
    const doc = { ...DOC, caso: { ...DOC.caso, version: `0.2.${Date.now() % 1_000_000}` } };
    const importado = await send(contexto.request, token, 'post', '/api/authoring/cases/import', doc, 'importar SIM-VBG-002');
    await loginAs(page, PROFESOR);
    await page.goto(`/portal/casos/${importado['caseVersionId']}/ensayo`);
    await waitForWorldReady(page);

    const ficha = page.locator('app-scene-goal-card');
    const toggle = ficha.locator('button.goal-card__toggle');
    const paso = ficha.locator('[data-guia-paso] .goal-card__paso-texto');
    const cuenta = ficha.locator('[data-guia-paso] .goal-card__paso-cuenta');
    await expect(toggle, 'al empezar el caso la ficha está abierta').toHaveAttribute('aria-expanded', 'true');
    await expect(paso).toHaveText(/^Habla con .+/);
    await expect(cuenta).toHaveText(/^Siguiente paso · 1 de \d+$/);
    await page.waitForTimeout(800);
    if (carpeta) await page.screenshot({ path: join(carpeta, 'guia-inicio-1920x1070.png') });

    // Escena 1: dos pasos; tras cada uno la cuenta avanza.
    const driver = createWorldInputDriver(page, 'keyboard');
    await cumplirPaso(page, driver, paso);
    await expect(cuenta).toHaveText(/^Siguiente paso · 2 de \d+$/);
    await page.waitForTimeout(800);
    if (carpeta) await page.screenshot({ path: join(carpeta, 'guia-tras-el-primer-paso-1920x1070.png') });
    await cumplirPaso(page, driver, paso);
    await expect(cuenta).toHaveText(/· 3 de \d+$/);

    // La persona puede plegarla; en la escena 2 (panel de autora) se vuelve a abrir con el objetivo nuevo.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const objetivo = await ficha.getAttribute('data-goal');
    // Otra escena que la actual (el ensayo arranca en la escena inicial del caso).
    const selector = page.locator('app-rehearsal-panel select[data-field="irA"]');
    const actual = await selector.inputValue();
    const otra = await selector.locator('option').evaluateAll((opciones, valor) =>
      (opciones as HTMLOptionElement[]).map(o => o.value).find(v => v !== valor) ?? valor, actual);
    await selector.selectOption(otra);
    await page.locator('app-rehearsal-panel button[data-action="irA"]').click();
    await expect.poll(() => ficha.getAttribute('data-goal'), { message: 'la escena 2 trae su objetivo', timeout: 30_000 }).not.toBe(objetivo);
    await waitForWorldReady(page);
    await expect(toggle, 'con el objetivo nuevo la ficha se vuelve a abrir').toHaveAttribute('aria-expanded', 'true');
    await expect(paso).toHaveText(/^Habla con .+/);
    await cumplirPaso(page, driver, paso);
  } finally {
    await contexto.close();
  }
});
