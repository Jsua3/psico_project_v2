import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { irAlMapaDelCaso, rutaEditor } from './autoria-flujo';
import { loginAs } from './screen-tour';
import { scaled } from './time-scale';

/**
 * Los momentos del editor de casos, en el orden en que se recorren (P6): el mapa del caso, el guion de una escena, una
 * sala, los datos del caso, las tres pestañas de Evaluación (pasos profesionales, rúbrica y finales) y enviar a revisión.
 * Cada uno es una pantalla con su propia dirección; los nombres son los que se leen en los informes de las sondas.
 */
export const EDITOR_TABS = [
  'El caso', 'Guion de la escena', 'Sala', 'Datos del caso', 'Pasos profesionales', 'Rúbrica', 'Finales', 'Enviar a revisión', 'Plano del caso',
] as const;

/**
 * Crea desde la interfaz un caso propio con una sala de la universidad (lo mismo que hace un docente: elegir el lugar, usar
 * una idea de salas y crear el caso) y deja el editor abierto en el mapa del caso. Pasar por la interfaz y no por la API
 * es a propósito: el editor copia el lugar al caso en el navegador, y las sondas tienen que ver un caso con salas, objetos
 * y personajes de verdad, no uno en blanco.
 */
export async function crearCasoDesdeLaUniversidad(page: Page, titulo: string): Promise<number> {
  await page.goto('/portal/casos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('link', { name: /^Elegir este lugar/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('button', { name: /^Usar esta idea/ }).first().click();
  await page.getByLabel('Nombre del caso').fill(titulo);
  await page.getByRole('button', { name: /^Crear el caso(?: con estas salas)?$/ }).click();
  const id = await irAlMapaDelCaso(page);
  await expect(page.locator('button.escena').first()).toBeVisible({ timeout: scaled(30_000) });
  return id;
}

/**
 * Recorre las pantallas del editor de un caso que ya está abierto en el mapa del caso, llamando a `visit` en cada una ya
 * asentada. En la sala exige ver sus piezas y en el guion el título de la escena: una sonda que audita una pantalla vacía
 * la daría por limpia sin haber mirado nada.
 */
export async function recorrerEditor(page: Page, visit: (tab: (typeof EDITOR_TABS)[number]) => Promise<void>): Promise<void> {
  const base = rutaEditor(page);
  // Las etapas pasan a un menu en pantallas estrechas; las sondas abren cada ruta del editor.
  const ir = async (ruta: string) => page.goto(`${base}/${ruta}`);

  await page.waitForTimeout(400);
  await visit('El caso');

  await page.locator('button.escena').first().dblclick();
  await expect(page.getByRole('heading', { level: 1, name: 'Guion de la escena' })).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Guion de la escena');

  await page.getByRole('link', { name: 'Abrir sala' }).click();
  await expect(page.locator('.pieza').first()).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Sala');

  await ir('datos');
  await expect(page.getByRole('heading', { level: 1, name: 'Datos del caso' })).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.getByLabel('Contexto que lee el estudiante')).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Datos del caso');

  // Evaluación es una etapa con tres pestañas (E5). Las pestañas son ENLACES (cada una con su dirección), no `role="tab"`:
  // se entra por la etapa y se pasa de una a otra con la barra «Partes de la evaluación».
  const partes = page.getByRole('navigation', { name: 'Partes de la evaluación' });
  await ir('evaluacion');
  await expect(page.getByRole('heading', { level: 1, name: 'Pasos profesionales' })).toBeVisible({ timeout: scaled(30_000) });
  await expect(partes).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Pasos profesionales');

  await partes.getByRole('link', { name: /^Rúbrica/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rúbrica del caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Rúbrica');

  await partes.getByRole('link', { name: /^Finales/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finales del caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Finales');

  await ir('revision');
  await expect(page.getByRole('heading', { level: 1, name: 'Enviar a revisión' })).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Enviar a revisión');

  await ir('plano');
  await expect(page.getByRole('heading', { level: 1, name: 'Plano del caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.waitForTimeout(400);
  await visit('Plano del caso');
}

/**
 * Entra como administrador, crea un caso propio desde la universidad (`crearCasoDesdeLaUniversidad`) y recorre las
 * pantallas del editor (`recorrerEditor`). El segundo parámetro solo conserva la firma de cuando las sondas armaban el
 * caso por la API.
 */
export async function visitEditorTabs(
  page: Page, _request: unknown, visit: (tab: (typeof EDITOR_TABS)[number]) => Promise<void>,
): Promise<void> {
  await loginAs(page, 'admin');
  await crearCasoDesdeLaUniversidad(page, `Sondas del editor ${Date.now()}`);
  await recorrerEditor(page, visit);
}
