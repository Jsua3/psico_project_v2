import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { ADMIN, apiToken, contentReviewProof, transition } from './case-fixtures';
import { runAxe } from './quality-gates';
import { enterCaseAtContentWarning, loginStudent, waitForWorldReady } from './siep-flow';
import { scaled } from './time-scale';

/**
 * Los pasos de un docente en el editor nuevo de casos (P6), escritos como los hace una persona: por la interfaz y contra el
 * servidor real. Los comparten el recorrido del docente (`autoria-docente.e2e.ts`), las funciones críticas con teclado y el
 * juego de objetos animados, que necesita un caso publicado desde el editor.
 *
 * Una escritura del editor se guarda al salir del campo (evento `change`): cada paso sale del campo con `blur()` y espera
 * a que el servidor termine de guardar antes de seguir (`guardado`).
 */

/** Espera a que el indicador de guardado del editor diga que no queda nada pendiente. */
export async function guardado(page: Page): Promise<void> {
  // Un cambio viaja en cola: se da un respiro para que empiece y luego se espera a que termine.
  await page.waitForTimeout(150);
  await page.waitForFunction(() => {
    const estado = document.querySelector('[data-estado-guardado]');
    return !estado || !/guardando/i.test(estado.textContent ?? '');
  }, undefined, { timeout: scaled(30_000) });
}

/** Crea un caso desde la universidad con la idea «Atención en Bienestar» y deja el editor en el mapa del caso. */
export async function crearCasoBienestar(page: Page, titulo: string): Promise<number> {
  await page.goto('/portal/casos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('link', { name: 'Elegir este lugar: Universidad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('button', { name: 'Usar esta idea: Atención en Bienestar' }).click();
  await page.getByLabel('Nombre del caso').fill(titulo);
  await page.getByRole('button', { name: 'Crear el caso con estas salas' }).click();
  await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
  await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.locator('button.escena')).toHaveCount(3, { timeout: scaled(30_000) });
  return Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);
}

/** La dirección de una pantalla del editor del caso abierto. */
export function rutaEditor(page: Page, resto = ''): string {
  const id = /\/portal\/casos\/(\d+)\/editor/.exec(page.url())?.[1];
  if (!id) throw new Error(`No hay un caso abierto en el editor: ${page.url()}`);
  return `/portal/casos/${id}/editor${resto}`;
}

/** Abre el guion de la escena número `numero` (la 1 es la del inicio) desde el mapa del caso. */
export async function abrirGuion(page: Page, numero: number): Promise<void> {
  await page.goto(rutaEditor(page));
  await expect(page.locator('button.escena').nth(numero - 1)).toBeVisible({ timeout: scaled(30_000) });
  await page.locator('button.escena').nth(numero - 1).click();
  await page.getByRole('link', { name: 'Abrir guion' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Guion de la escena' })).toBeVisible({ timeout: scaled(30_000) });
}

/** Agrega una línea y la escribe (la última de la lista). */
export async function escribirLinea(page: Page, texto: string): Promise<void> {
  await page.getByRole('button', { name: 'Agregar una línea' }).click();
  const n = await page.locator('ol > li.linea').count();
  const campo = page.getByLabel(`Lo que dice, línea ${n}`);
  await campo.fill(texto);
  await campo.blur();
  await guardado(page);
}

export interface RespuestaEscrita {
  texto: string;
  clase: 'Recomendada' | 'Aceptable' | 'Con riesgo' | 'Contraindicada';
  despues: string;
  /** Solo para las contraindicadas: por qué pueden hacerle daño a la persona. */
  razon?: string;
  /** La escena a la que lleva, como se lee en la lista («2 · Sala de espera de Bienestar»); sin ella queda sin destino. */
  llevaA?: string;
  /** Los nombres de los hitos que cumple la respuesta. */
  hitos?: string[];
}

/** Agrega una respuesta y la escribe completa; devuelve su número. */
export async function escribirRespuesta(page: Page, r: RespuestaEscrita): Promise<number> {
  await page.getByRole('button', { name: 'Agregar una respuesta' }).click();
  const n = await page.locator('li.respuesta').count();
  const tarjeta = page.locator('li.respuesta').nth(n - 1);
  const campo = tarjeta.getByLabel(`Respuesta ${n}`, { exact: true });
  await campo.fill(r.texto);
  await campo.blur();
  await tarjeta.getByRole('radio', { name: r.clase, exact: true }).check();
  if (r.clase === 'Contraindicada') {
    const razon = tarjeta.getByLabel('Por qué es contraindicada');
    await razon.fill(r.razon ?? 'Puede hacerle daño a la persona.');
    await razon.blur();
  }
  const retro = tarjeta.getByLabel('Lo que lee el estudiante después de elegir');
  await retro.fill(r.despues);
  await retro.blur();
  for (const hito of r.hitos ?? []) await tarjeta.getByRole('checkbox', { name: hito, exact: true }).check();
  if (r.llevaA) await tarjeta.getByLabel('Lleva a…').selectOption({ label: r.llevaA });
  await guardado(page);
  return n;
}

/** Marca una escena como final desde el mapa del caso (menú de la escena, con clic derecho). */
export async function marcarFinal(page: Page, numero: number): Promise<void> {
  await page.goto(rutaEditor(page));
  await expect(page.locator('button.escena').nth(numero - 1)).toBeVisible({ timeout: scaled(30_000) });
  await page.locator('button.escena').nth(numero - 1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Marcar como final' }).click();
  await guardado(page);
}

// ─── Un caso completo, del recorrido «Atención en Bienestar» ────────────────────────────────────────────────────────

/** Los seis hitos que trae el lugar; cada uno tiene que cumplirse en alguna respuesta que se alcance desde el inicio. */
export const HITOS_BIENESTAR = [
  'Valorar el riesgo', 'Informar derechos', 'Recomendar medidas de protección', 'Derivar a salud mental',
  'Aplicar primeros auxilios psicológicos', 'No mediar con el agresor',
] as const;

export const ESCENA_ESPERA = '2 · Sala de espera de Bienestar';
export const ESCENA_CONSULTORIO = '3 · Consultorio de atención psicológica';
export const RECURSO_DE_APOYO = 'Línea de atención de Bienestar Universitario';

/** Escribe los recursos de apoyo de la escena abierta (uno por línea). */
export async function escribirRecursosDeApoyo(page: Page, texto: string): Promise<void> {
  const campo = page.getByLabel('Recursos de apoyo para el estudiante');
  await campo.fill(texto);
  await campo.blur();
  await guardado(page);
}

/**
 * Escribe las tres escenas de «Atención en Bienestar» como las escribiría un docente: un recurso de apoyo, una línea y dos
 * respuestas en las dos primeras (una de ellas Contraindicada, con su razón), y la tercera como final. Los seis hitos del
 * lugar quedan cumplidos entre las respuestas. `alPaso` se llama al terminar cada escena (el recorrido del docente mide
 * accesibilidad ahí).
 */
export async function escribirCasoBienestar(page: Page, alPaso: (paso: string) => Promise<void> = async () => undefined): Promise<void> {
  await abrirGuion(page, 1);
  await escribirRecursosDeApoyo(page, RECURSO_DE_APOYO);
  await escribirLinea(page, 'Hola, ¿esta es la oficina de Bienestar?');
  await escribirRespuesta(page, {
    texto: 'Sí, la sala de espera está aquí al lado. ¿Te acompaño?', clase: 'Recomendada', despues: 'Ofrecer compañía da seguridad.',
    llevaA: ESCENA_ESPERA, hitos: ['Valorar el riesgo', 'Informar derechos', 'Aplicar primeros auxilios psicológicos'],
  });
  await escribirRespuesta(page, {
    texto: 'Sigue derecho, al fondo.', clase: 'Con riesgo', despues: 'Indica el camino pero deja sola a la persona.', llevaA: ESCENA_ESPERA,
  });
  await alPaso('guion de la primera escena');

  await abrirGuion(page, 2);
  await escribirLinea(page, 'No sé si entrar, me da pena.');
  await escribirRespuesta(page, {
    texto: 'Es normal sentirse así. Aquí te escuchan con calma.', clase: 'Recomendada', despues: 'Valida la emoción sin presionar.',
    llevaA: ESCENA_CONSULTORIO, hitos: ['Recomendar medidas de protección', 'Derivar a salud mental', 'No mediar con el agresor'],
  });
  await escribirRespuesta(page, {
    texto: 'Si te da pena, mejor vuelve otro día.', clase: 'Contraindicada', despues: 'Refuerza la evitación.',
    razon: 'Refuerza la evitación y deja sin apoyo a una persona que puede estar en riesgo.', llevaA: ESCENA_CONSULTORIO,
  });
  await alPaso('guion de la segunda escena, con una respuesta contraindicada y su razón');

  await abrirGuion(page, 3);
  await escribirLinea(page, 'Gracias por recibirme. Quería hablar de algo que me pasa.');
  await marcarFinal(page, 3);
  await alPaso('mapa del caso con las tres escenas escritas');
}

/** Abre la sala de la primera escena desde el mapa del caso y elige a su primera persona en la lista «En esta sala» (sin arrastrar). */
async function abrirPrimeraPersona(page: Page): Promise<string> {
  await page.goto(rutaEditor(page));
  await expect(page.locator('button.escena').first()).toBeVisible({ timeout: scaled(30_000) });
  await page.locator('button.escena').first().click();
  await page.getByRole('link', { name: 'Abrir sala' }).click();
  await expect(page.locator('.pieza').first()).toBeVisible({ timeout: scaled(30_000) });
  const persona = page.getByRole('group', { name: 'Personajes' }).getByRole('option').first();
  const nombre = (await persona.innerText()).trim();
  await persona.click();
  await expect(page.getByRole('heading', { level: 2, name: nombre })).toBeVisible();
  return nombre;
}

/**
 * Marca a la primera persona de la primera sala como la persona a atender, desde la sala del editor: elige a la persona en la
 * lista, marca «Persona a atender» y comprueba que la sala la señala con su marca (forma y texto) y que el editor lo dice.
 * Devuelve su nombre.
 */
export async function marcarPersonaAAtender(page: Page): Promise<string> {
  const nombre = await abrirPrimeraPersona(page);
  await page.getByRole('checkbox', { name: 'Persona a atender' }).check();
  await guardado(page);
  await expect(page.locator('[data-aviso-persona]')).toContainText(`Ahora la persona a atender es ${nombre}`);
  await expect(page.locator('.marca-atender')).toHaveCount(1);
  await expect(page.locator('.marca-atender')).toContainText('A atender');
  await expect(page.getByRole('option', { name: new RegExp(`${nombre}.*persona a atender`, 'i') })).toBeVisible();
  return nombre;
}

/**
 * Con la persona elegida en la sala, hace que vaya y venga: «Va y viene», «Elegir el punto», el punto se mueve con las flechas
 * del teclado (sin arrastrar) y «Listo» lo fija. Comprueba que la sala dibuja la marca del punto y la línea.
 */
export async function hacerQueVayaYVenga(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Va y viene' }).click();
  await page.getByRole('button', { name: 'Elegir el punto' }).click();
  const punto = page.locator('.punto-ida');
  await expect(punto).toBeFocused();
  const antes = { x: Number(await punto.getAttribute('data-x')), y: Number(await punto.getAttribute('data-y')) };
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(punto).toHaveAttribute('data-x', String(antes.x + 8));
  await expect(punto).toHaveAttribute('data-y', String(antes.y + 8));
  await expect(page.locator('[data-aviso-punto]')).toHaveText('');
  await page.getByRole('button', { name: 'Listo' }).click();
  await guardado(page);
  await expect(page.locator('.punto-ida')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Va y viene' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('svg.trazos [data-hasta]')).toHaveCount(1);
  await expect(page.locator('svg.trazos [data-ida]')).toHaveCount(1);
}

/** Marca la lista de verificación entera y envía el caso a Psicología desde la pantalla de revisión. */
export async function completarListaYEnviar(page: Page): Promise<void> {
  await page.goto(rutaEditor(page, '/revision'));
  await expect(page.getByRole('heading', { level: 1, name: 'Enviar a revisión' })).toBeVisible({ timeout: scaled(30_000) });
  const casillas = page.locator('#lista-verificacion input[type=checkbox]');
  await expect(casillas.first()).toBeVisible({ timeout: scaled(30_000) });
  for (let i = 0; i < await casillas.count(); i++) {
    if (!(await casillas.nth(i).isChecked())) {
      await casillas.nth(i).check();
      await guardado(page);
    }
  }
  await expect(page.getByRole('heading', { name: 'Por resolver (0)' })).toBeVisible({ timeout: scaled(30_000) });
  const enviar = page.getByRole('button', { name: 'Enviar a Psicología' });
  await expect(enviar).toHaveAttribute('aria-disabled', 'false', { timeout: scaled(30_000) });
  await enviar.click();
  await expect(page.getByText('El caso está en revisión de Psicología. Se puede ver, pero no editar.').first()).toBeVisible({ timeout: scaled(30_000) });
}

// ─── Accesibilidad de cada paso ─────────────────────────────────────────────────────────────────────────────────────

const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Espera a que terminen las animaciones FINITAS (Axe mide el contraste a media transición y se equivoca). */
export async function asentar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: scaled(15_000) }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finitas = document.getAnimations().filter((animacion) => {
      const fin = animacion.effect?.getComputedTiming().endTime;
      return typeof fin === 'number' && Number.isFinite(fin);
    });
    await Promise.race([Promise.allSettled(finitas.map((a) => a.finished)), new Promise((r) => setTimeout(r, 3000))]);
  });
  await page.waitForTimeout(250);
}

/** Axe (WCAG 2.2 AA) sobre la pantalla: ninguna infracción seria ni crítica, y que de verdad haya evaluado reglas. */
export async function sinInfraccionesGraves(page: Page, donde: string): Promise<void> {
  // La barra fija tapa lo que queda debajo cuando la página está desplazada (Axe lo cuenta como objetivo
  // solapado): se mide desde arriba, como en `autoria-a11y.e2e.ts`.
  await page.evaluate(() => window.scrollTo(0, 0));
  await asentar(page);
  const resultados = await runAxe(page, { tags: ETIQUETAS_WCAG, resultTypes: ['violations', 'passes'] });
  expect(resultados.passes.length, `${donde}: Axe evaluó reglas sobre la pantalla`).toBeGreaterThan(10);
  const graves = resultados.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((nodo) => `[${v.impact}] ${v.id} · ${nodo.target.join(' ')} · ${nodo.failureSummary ?? ''}`.replace(/\s+/g, ' ')));
  expect(graves, `${donde}: infracciones serias o críticas de accesibilidad`).toEqual([]);
}

/** Psicología aprueba y publica el caso (por la API, con la constancia de contenido que pide el servidor). */
export async function aprobarYPublicarPorApi(request: APIRequestContext, caseVersionId: number): Promise<void> {
  const admin = await apiToken(request, ADMIN);
  const respuesta = await transition(request, admin, caseVersionId, { action: 'approve', note: 'Caso de prueba e2e.', contentReview: contentReviewProof() });
  expect(respuesta.status(), `aprobar y publicar: ${await respuesta.text()}`).toBe(200);
}

/**
 * El estudiante de la semilla entra al primer caso de su lobby y llega a la primera sala. La tarjeta «Antes de comenzar»
 * sale en toda partida nueva: se pasa y, si no sale, el mundo aparece justo después del aviso de contenido.
 */
export async function entrarALaPrimeraSala(page: Page): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  const consent = await enterCaseAtContentWarning(page);
  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const mundo = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  const tarjeta = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  const limite = Date.now() + scaled(60_000);
  while (Date.now() < limite && !(await mundo.isVisible().catch(() => false))) {
    if (await tarjeta.isVisible().catch(() => false)) await tarjeta.getByRole('button', { name: /^continuar$/i }).click();
    else await page.waitForTimeout(250);
  }
  await waitForWorldReady(page);
}
