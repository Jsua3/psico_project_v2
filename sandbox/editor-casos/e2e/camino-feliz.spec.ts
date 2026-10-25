import { type Page, expect, test } from '@playwright/test';

import { crearCaso } from './ayudas';

/**
 * Criterio de éxito del diseño: crear un caso de la universidad con escenas escritas, un
 * camino que se separa y dos finales, sin avisos; probarlo como estudiante y dejarlo listo
 * para enviar a Psicología.
 */

async function abrirGuion(page: Page, numero: number): Promise<void> {
  await page.getByRole('link', { name: 'El caso' }).click();
  await page.locator('button.escena').nth(numero - 1).click();
  await page.getByRole('link', { name: 'Abrir guion' }).click();
  await expect(page.getByRole('heading', { name: 'Guion de la escena' })).toBeVisible();
}

async function escribirLinea(page: Page, texto: string): Promise<void> {
  await page.getByRole('button', { name: 'Agregar una línea' }).click();
  const campo = page.getByLabel('Lo que dice, línea 1');
  await campo.fill(texto);
  await campo.blur();
}

async function escribirRespuesta(page: Page, n: number, texto: string, clasificacion: string, despues: string, llevaA?: string): Promise<void> {
  await page.getByRole('button', { name: 'Agregar una respuesta' }).click();
  const tarjeta = page.locator('li.respuesta').nth(n - 1);
  const campo = tarjeta.getByLabel(`Respuesta ${n}`);
  await campo.fill(texto);
  await campo.blur();
  await tarjeta.getByRole('radio', { name: clasificacion, exact: true }).check();
  const retro = tarjeta.getByLabel('Lo que lee el estudiante después de elegir');
  await retro.fill(despues);
  await retro.blur();
  if (llevaA) await tarjeta.getByLabel('Lleva a…').selectOption({ label: llevaA });
}

async function marcarFinal(page: Page, numero: number): Promise<void> {
  await page.getByRole('link', { name: 'El caso' }).click();
  await page.locator('button.escena').nth(numero - 1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Marcar como final' }).click();
}

test('un docente crea un caso con un camino que se separa, lo prueba y lo deja listo para revisión', async ({ page }) => {
  // 1. Crear el caso desde la universidad.
  await crearCaso(page);

  // 2. Escribir las escenas.
  await abrirGuion(page, 1);
  await escribirLinea(page, 'Hola, ¿esta es la oficina de Bienestar?');
  await escribirRespuesta(page, 1, 'Sí, la sala de espera está aquí al lado. ¿Te acompaño?', 'Adecuada', 'Ofrecer compañía da seguridad.', '2 · Sala de espera de Bienestar');
  await escribirRespuesta(page, 2, 'Sigue derecho, al fondo.', 'Con riesgo', 'Indica el camino pero deja sola a la persona.', '2 · Sala de espera de Bienestar');

  await abrirGuion(page, 2);
  await escribirLinea(page, 'No sé si entrar, me da pena.');
  await escribirRespuesta(page, 1, 'Es normal sentirse así. Aquí te escuchan con calma.', 'Adecuada', 'Valida la emoción sin presionar.', '3 · Consultorio de atención psicológica');
  // 3. Abrir un camino nuevo desde una respuesta.
  await escribirRespuesta(page, 2, 'Si te da pena, mejor vuelve otro día.', 'Inadecuada', 'Refuerza la evitación y la deja sin apoyo.');
  await page.locator('li.respuesta').nth(1).getByLabel('Lleva a…').selectOption({ label: 'Una escena nueva' });
  await page.getByRole('button', { name: 'Crear la escena nueva' }).click();
  await expect(page.getByText(/Se creó «4 · Escena nueva.*conectada a la respuesta 2/)).toBeVisible();
  await page.getByRole('link', { name: 'Abrir su guion' }).click();
  await escribirLinea(page, 'Bueno… mejor me voy.');

  await abrirGuion(page, 3);
  await escribirLinea(page, 'Gracias por recibirme. Quería hablar de algo que me pasa.');

  // 4. Marcar dos finales.
  await marcarFinal(page, 3);
  await marcarFinal(page, 4);

  // 5. Ver 0 avisos.
  await page.getByRole('link', { name: 'El caso' }).click();
  await expect(page.getByRole('heading', { name: 'Avisos (0)' })).toBeVisible();

  // 6. Probar como estudiante hasta un final.
  await page.getByRole('link', { name: 'Probar como estudiante' }).click();
  await expect(page.getByText('Escena 1 de 4')).toBeVisible();
  await page.getByLabel('Sí, la sala de espera está aquí al lado. ¿Te acompaño?').check();
  await page.getByRole('button', { name: 'Elegir esta respuesta' }).click();
  await expect(page.getByRole('group', { name: 'Resultado de la respuesta' })).toContainText('Ofrecer compañía da seguridad.');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Es normal sentirse así. Aquí te escuchan con calma.').check();
  await page.getByRole('button', { name: 'Elegir esta respuesta' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Ver el final' }).click();
  await expect(page.getByRole('heading', { name: 'Cierre integral' })).toBeVisible();

  // 7. Llegar a revisión con «Enviar a Psicología» habilitado.
  await page.getByRole('link', { name: 'Enviar a revisión' }).click();
  await expect(page.getByRole('heading', { name: 'Por resolver (0)' })).toBeVisible();
  const enviar = page.getByRole('button', { name: 'Enviar a Psicología' });
  await expect(enviar).toHaveAttribute('aria-disabled', 'false');
  await enviar.click();
  await expect(page.getByText('Listo. En el programa real, aquí el caso pasaría a revisión de Psicología.')).toBeVisible();
});
