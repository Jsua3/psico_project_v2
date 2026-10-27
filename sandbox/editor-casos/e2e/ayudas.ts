import { type Page, expect } from '@playwright/test';

/** Empieza de cero y crea un caso en la universidad con la idea «Atención en Bienestar». */
export async function crearCaso(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Crear un caso nuevo' }).first().click();
  await page.getByRole('link', { name: 'Elegir este lugar: Universidad' }).click();
  await page.getByRole('button', { name: 'Usar esta idea: Atención en Bienestar' }).click();
  await page.getByRole('button', { name: 'Crear el caso con estas salas' }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole('heading', { name: 'Escenas y caminos' })).toBeVisible();
}

/** Ids de las escenas del caso guardado, en orden. */
export async function escenas(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const caso = JSON.parse(localStorage.getItem('sandbox-editor-casos/v1') ?? '{"escenas":[]}');
    return caso.escenas.map((e: { id: string }) => e.id);
  });
}

/** Todas las rutas del sandbox, con un caso ya creado. */
export async function rutas(page: Page): Promise<string[]> {
  const ids = await escenas(page);
  return ['/', '/lugar', '/salas?lugar=universidad', '/editor', '/editor/sala/consultorio', `/editor/escena/${ids[0]}`, '/editor/finales', '/probar', '/revision'];
}

/** Espera a que la pantalla termine de cargar (imágenes y datos del lugar). */
export async function esperarPantalla(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1').first()).toBeVisible();
}
