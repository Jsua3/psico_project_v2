import { expect, test } from '@playwright/test';

import { crearCaso, escenas } from './ayudas';

test('al bajar en el guion, la cabecera no tapa el panel de IA ni la vista previa', async ({ page }) => {
  await crearCaso(page);
  const [primera] = await escenas(page);
  await page.goto(`/editor/escena/${primera}`);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Agregar una línea' }).click();
  await page.getByRole('button', { name: 'Asistente de IA' }).click();
  await expect(page.getByRole('heading', { name: 'Asistente de IA' })).toBeVisible();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const medidas = await page.evaluate(() => {
    const fondoCabecera = document.querySelector('header')!.getBoundingClientRect().bottom;
    const panel = document.querySelector('#panel-ia')!.getBoundingClientRect().top;
    const vista = document.querySelector('.vista')?.getBoundingClientRect().top ?? Infinity;
    return { fondoCabecera, panel, vista, bajo: window.scrollY };
  });
  expect(medidas.bajo).toBeGreaterThan(0);
  expect(medidas.panel).toBeGreaterThanOrEqual(medidas.fondoCabecera - 1);
  expect(medidas.vista).toBeGreaterThanOrEqual(medidas.fondoCabecera - 1);
});
