import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { ADMIN, PROFESOR, apiToken, contentReviewProof, readEditor, send, transition } from './case-fixtures';
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

/**
 * Un caso recién creado (a mano o con IA) se abre en el guion de su primera escena (E3): es lo primero que hay que escribir.
 * Esto espera esa llegada y lleva al mapa del caso, donde las pruebas siguen contando escenas y eligiendo una. Devuelve el id.
 */
export async function irAlMapaDelCaso(page: Page): Promise<number> {
  await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
  const id = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);
  const mapa = page.getByRole('heading', { level: 1, name: /Escenas y caminos/ });
  const guion = page.getByRole('heading', { level: 1, name: /^Guion de la escena/ });
  await expect(mapa.or(guion)).toBeVisible({ timeout: scaled(30_000) });
  if (await guion.isVisible()) {
    // La dirección se arma con el id, no con la actual (que ya trae `/escena/<id>`).
    await page.goto(`/portal/casos/${id}/editor`);
  }
  await expect(mapa).toBeVisible({ timeout: scaled(30_000) });
  return id;
}

/** Crea un caso desde la universidad con la idea «Atención en Bienestar» y deja el editor en el mapa del caso. */
export async function crearCasoBienestar(page: Page, titulo: string): Promise<number> {
  await page.goto('/portal/casos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('link', { name: 'Elegir este lugar: Universidad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('button', { name: 'Usar esta idea: Atención en Bienestar' }).click();
  await page.getByLabel('Nombre del caso').fill(titulo);
  await page.getByRole('button', { name: /^Crear el caso(?: con estas salas)?$/ }).click();
  const id = await irAlMapaDelCaso(page);
  await expect(page.locator('button.escena')).toHaveCount(3, { timeout: scaled(30_000) });
  return id;
}

/**
 * El mismo caso de «Atención en Bienestar», pero con salas de IMAGEN FIJA, creado por la API (`porPiezas: false`) y abierto
 * en el mapa del caso. Desde V6 el editor crea a mano por piezas; esto queda para las pruebas del camino de imagen fija, que
 * sigue vivo en los casos viejos y en los lugares sin plantilla por piezas (p. ej. la animación de cercanía de los marcadores,
 * que el juego publica en `data-proximity`).
 */
export async function crearCasoBienestarImagenFija(page: Page, request: APIRequestContext, titulo: string): Promise<number> {
  const token = await apiToken(request, PROFESOR);
  const respuesta = await request.post('/api/authoring/cases', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: titulo, lugarId: 'universidad', salas: ['pasillo', 'sala-espera', 'consultorio'], porPiezas: false,
      description: 'Una persona llega a Bienestar, espera su turno y es escuchada en el consultorio.',
    },
  });
  expect(respuesta.ok(), `crear el caso de imagen fija: ${respuesta.status()}`).toBeTruthy();
  const id = (await respuesta.json()).data.caseVersionId as number;
  await page.goto(`/portal/casos/${id}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.locator('button.escena')).toHaveCount(3, { timeout: scaled(30_000) });
  return id;
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
  const lineas = page.locator('ol > li.linea');
  const n = (await lineas.count()) + 1;
  await page.getByRole('button', { name: 'Agregar una línea' }).click();
  // La línea nueva aparece cuando el servidor la crea: contarlas antes de eso escribiría sobre la anterior.
  await expect(lineas).toHaveCount(n, { timeout: scaled(30_000) });
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
  const respuestas = page.locator('li.respuesta');
  const n = (await respuestas.count()) + 1;
  await page.getByRole('button', { name: 'Agregar una respuesta' }).click();
  // La respuesta nueva aparece cuando el servidor la crea. Si se cuenta antes, «la última» todavía es la anterior y se
  // escribe encima: la escena queda con una sola opción y sin la recomendada (pasó en una corrida real).
  await expect(respuestas).toHaveCount(n, { timeout: scaled(30_000) });
  const tarjeta = respuestas.nth(n - 1);
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
  if (r.hitos?.length) {
    // Los pasos que cumple la respuesta viven en la faceta «Pasos» (E2): se abre antes de marcarlos. El botón se llama
    // «Pasos» más su cuenta («Pasos 0»); abrir una faceta cierra la otra, así que no queda nada abierto de antes.
    const faceta = tarjeta.getByRole('button', { name: /^Pasos/ });
    if ((await faceta.getAttribute('aria-expanded')) !== 'true') await faceta.click();
    for (const hito of r.hitos) await tarjeta.getByRole('checkbox', { name: hito, exact: true }).check();
  }
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
    // `label-content-name-mismatch` (2.5.3, experimental en Axe): ver D-E7 en DECISIONES.md. El hilo, el riel y las fichas de sala
    // llevan un nombre accesible completo sobre un texto visible corto; queda pendiente de decisión, no escondido.
    .filter((v) => v.id !== 'label-content-name-mismatch')
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

// ─── Generar un caso con IA (proveedor falso de C1) ─────────────────────────────────────────────────────────────────

type Json = Record<string, any>;

/** El e2e de la generación solo corre con el backend aislado en `AI_AUTHORING_PROVIDER=fake` y `SIEP_E2E_GENERACION=1`. */
export const GENERACION_CON_PROVEEDOR_FALSO = process.env['SIEP_E2E_GENERACION'] === '1';
export const MOTIVO_SIN_PROVEEDOR_FALSO = 'Corre con AI_AUTHORING_PROVIDER=fake y SIEP_E2E_GENERACION=1';

/** Una descripción de bienestar universitario (de 40 a 2000 caracteres, texto plano, sin datos de nadie). */
export const DESCRIPCION_BIENESTAR =
  'Una estudiante se queda sola en el aula después de clase, muy afectada por una situación de violencia con su pareja. '
  + 'Quiero que el estudiante practique escucharla, acompañarla hasta Bienestar y explicarle sus derechos sin presionarla.';

/** Lo que dice el servidor cuando la IA se niega (texto fijo de C1). */
export const MENSAJE_NEGATIVA_IA = 'La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.';

const CAMPO_DESCRIPCION = 'Describe la situación y lo que debe aprender el estudiante';

/** Entra a «crear un caso», elige la universidad y, en el paso 2, la forma «Describe tu caso». */
export async function elegirDescribirTuCaso(page: Page): Promise<void> {
  await page.goto('/portal/casos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('link', { name: 'Elegir este lugar: Universidad' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
  const forma = page.getByRole('radio', { name: /^Describe tu caso/ });
  await expect(forma).toBeEnabled({ timeout: scaled(30_000) });
  await forma.check();
  await expect(page.getByLabel(CAMPO_DESCRIPCION)).toBeVisible({ timeout: scaled(30_000) });
}

/** Escribe la descripción y pulsa «Generar el caso con IA»: la docente llega a la pantalla de avance. Devuelve el id de la generación. */
export async function generarConDescripcion(page: Page, descripcion: string): Promise<string> {
  await page.getByLabel(CAMPO_DESCRIPCION).fill(descripcion);
  await page.getByRole('button', { name: 'Generar el caso con IA' }).click();
  await page.waitForURL(/\/portal\/casos\/nuevo\/generando\/[0-9a-f-]+/, { timeout: scaled(60_000) });
  return /\/generando\/([0-9a-f-]+)/.exec(page.url())![1];
}

/**
 * Retiene las peticiones de escena de la generación hasta que se llame `soltar()`: el esqueleto ya salió y el avance se queda a
 * mitad, con las dos primeras escenas «en curso», sin depender de cuánto tarde el servidor (la IA falsa contesta al instante).
 */
export async function retenerEscenas(page: Page): Promise<{ soltar: () => Promise<void> }> {
  let abrir!: () => void;
  const puerta = new Promise<void>((resolver) => { abrir = resolver; });
  const patron = '**/api/authoring/generations/*/scenes/*';
  const retenidas: Promise<void>[] = [];
  await page.route(patron, (ruta) => {
    const sigue = puerta.then(() => ruta.continue()).catch(() => undefined);
    retenidas.push(sigue);
    return sigue;
  });
  // Al soltar se espera a que cada petición retenida haya seguido su camino (sin una espera fija) y luego se quita la ruta.
  return { soltar: async () => { abrir(); await Promise.all(retenidas); await page.unroute(patron).catch(() => undefined); } };
}

/** La pantalla de avance llegó a «listo»: el título lo dice y trae «Abrir mi caso». */
export async function esperarCasoListo(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Tu caso está listo como borrador' })).toBeVisible({ timeout: scaled(120_000) });
  await expect(page.getByRole('button', { name: 'Abrir mi caso' })).toBeVisible();
}

/** Pulsa «Abrir mi caso» y devuelve el id del borrador creado. */
export async function abrirMiCaso(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Abrir mi caso' }).click();
  return irAlMapaDelCaso(page);
}

/** Cancela la generación abierta de la docente (por la API), para que una prueba nunca deje a la siguiente con «Ya tienes un caso generándose». */
export async function cancelarGeneracionAbierta(request: APIRequestContext): Promise<void> {
  const docente = await apiToken(request, PROFESOR);
  const estado = await request.get('/api/authoring/generations/status', { headers: { Authorization: `Bearer ${docente}` } });
  if (estado.status() !== 200) return;
  const abierta = ((await estado.json()).data as Json)['inProgress'] as Json | null;
  if (abierta) await request.delete(`/api/authoring/generations/${abierta['id']}`, { headers: { Authorization: `Bearer ${docente}` } });
}

/** Cuántas veces aparece `"aiSuggested":true` en el editor del caso (lo que la IA propuso y nadie ha revisado). */
export async function sugeridoPorLaIa(request: APIRequestContext, token: string, caseVersionId: number): Promise<number> {
  return (JSON.stringify(await readEditor(request, token, caseVersionId)).match(/"aiSuggested":true/g) ?? []).length;
}

export interface FaltasDeOcl {
  /** La respuesta con un requisito que nombra un hito que el caso no tiene (OCL-10, `…opciones[j].requiere`). */
  requisito: number;
  /** La respuesta con una reacción de alguien que no está en la sala (OCL-12, `…opciones[j].reaccion`). */
  reaccion: number;
  /** La posición del comentario cuyo personaje no está en la sala de la escena (OCL-12, `…comentarios[k]`). */
  comentario: number;
  /** Lo que hay que deshacer para dejar el caso como estaba. */
  deshacer: () => Promise<void>;
}

/**
 * Le pone al caso tres faltas de las reglas OCL-09 a OCL-12 que el editor no deja escribir pero el servidor sí guarda (es lo
 * que una IA, un documento importado o una edición vieja pueden dejar): un requisito que nombra un hito inexistente (OCL-10),
 * una reacción de alguien que no está en la sala y un comentario de alguien que no está en la sala (las dos, OCL-12). La emoción
 * fuera del vocabulario (OCL-11) el servidor ya no la guarda: no se puede dejar por aquí. Van en la primera escena.
 */
export async function ponerFaltasDeOcl(request: APIRequestContext, token: string, caseVersionId: number): Promise<FaltasDeOcl> {
  const base = `/api/authoring/cases/${caseVersionId}`;
  const vista = await readEditor(request, token, caseVersionId);
  const escena = (vista['nodes'] as Json[]).find((n) => n['startNode'])!;
  const respuestas = (vista['decisions'] as Json[]).filter((d) => d['sourceNodeId'] === escena['id']);
  const sinRequisito = respuestas.filter((d) => Object.keys(d['requires'] ?? {}).length === 0);
  expect(sinRequisito.length, 'la primera escena trae al menos dos respuestas sin requisito para tocar').toBeGreaterThanOrEqual(2);
  const [conRequisito, conReaccion] = sinRequisito;
  const cuerpo = (d: Json, extra: Json) => ({
    sourceNodeId: d['sourceNodeId'], targetNodeId: d['targetNodeId'], optionKey: d['optionKey'], text: d['text'],
    responseClass: d['responseClass'], prohibitedConduct: d['prohibitedConduct'], prohibitionReason: d['prohibitionReason'],
    immediateFeedback: d['immediateFeedback'], ...extra,
  });
  // Alguien del caso que no está en la sala de la escena: se toma de los propios datos del caso (sin nombrar a nadie del archivo
  // del proveedor), de preferencia alguien sin ninguna PERSON en el mapa de ninguna sala.
  const mapaInicio = (vista['maps'] as Json[]).find((m) => m['nodeId'] === escena['id']);
  const personas = (vista['objects'] as Json[]).filter((o) => o['type'] === 'PERSON' && o['characterId'] != null && o['visible'] !== false);
  const sinSala = (vista['characters'] as Json[]).filter((c) => !personas.some((o) => o['characterId'] === c['id']));
  const fueraDelInicio = (vista['characters'] as Json[]).filter((c) => !personas.some((o) => o['characterId'] === c['id'] && o['mapId'] === mapaInicio?.['id']));
  const elegido = sinSala[0] ?? fueraDelInicio[0];
  expect(elegido, 'el caso trae a alguien que no está en la sala de la primera escena').toBeTruthy();
  const ajeno = String(elegido!['key']);
  await send(request, token, 'put', `${base}/decisions/${conRequisito['id']}`, cuerpo(conRequisito, { requires: { milestone: 'hito-que-no-existe' } }), 'requisito con un hito inexistente (OCL-10)');
  await send(request, token, 'put', `${base}/decisions/${conReaccion['id']}`,
    cuerpo(conReaccion, { reaction: { ...(conReaccion['reaction'] ?? {}), linea: 'Ay, no sé qué decir.', personaje: ajeno } }), 'reacción de alguien que no está en la sala (OCL-12)');

  const actual = (await readEditor(request, token, caseVersionId) as Json)['nodes'].find((n: Json) => n['id'] === escena['id']) as Json;
  const comentarios = (actual['comments'] ?? []) as Json[];
  const cuerpoEscena = (comments: Json[]) => ({
    nodeKey: actual['key'], title: actual['title'], narrative: actual['narrative'], supportResources: actual['supportResources'],
    requiredTools: actual['requiredTools'], sensitiveContent: actual['sensitiveContent'], safeExitRequired: actual['safeExitRequired'],
    warningMessage: actual['warningMessage'], terminal: actual['terminal'], startNode: actual['startNode'],
    positionX: actual['positionX'], positionY: actual['positionY'], comments,
  });
  await send(request, token, 'put', `${base}/nodes/${escena['id']}`,
    cuerpoEscena([...comentarios, { personaje: ajeno, linea: 'Pasaba por aquí y me quedé escuchando.' }]), 'comentario de alguien que no está en la sala (OCL-12)');

  return {
    requisito: conRequisito['id'], reaccion: conReaccion['id'], comentario: comentarios.length,
    deshacer: async () => {
      await readEditor(request, token, caseVersionId);
      await send(request, token, 'put', `${base}/decisions/${conRequisito['id']}`, cuerpo(conRequisito, { requires: {} }), 'quitar el requisito');
      await send(request, token, 'put', `${base}/decisions/${conReaccion['id']}`, cuerpo(conReaccion, { reaction: conReaccion['reaction'] ?? {} }), 'restaurar la reacción');
      await send(request, token, 'put', `${base}/nodes/${escena['id']}`, cuerpoEscena(comentarios), 'quitar el comentario ajeno');
    },
  };
}

/**
 * La generación exige la rúbrica por defecto (en producción la siembra `seed_default_rubric`; la base desechable del e2e no la
 * trae). Si `status` dice que está apagada, la crea como administrador por la API —la misma ruta que usa la pantalla de
 * rúbricas, con los seis criterios de la básica— y comprueba que la generación quedó disponible.
 */
export async function asegurarGeneracionDisponible(request: APIRequestContext): Promise<void> {
  const docente = await apiToken(request, PROFESOR);
  const disponible = async (): Promise<boolean> => {
    const estado = await request.get('/api/authoring/generations/status', { headers: { Authorization: `Bearer ${docente}` } });
    expect(estado.status(), 'estado de la generación').toBe(200);
    return ((await estado.json()).data as Json)['enabled'] === true;
  };
  if (await disponible()) return;
  const admin = await apiToken(request, ADMIN);
  const criterios = [
    ['COMPRENSION_SITUACION', 'Identificación y comprensión de la situación', 20], ['ANALISIS_ARGUMENTACION', 'Análisis psicosocial y argumentación', 20],
    ['DECISION_RUTA', 'Toma de decisiones y ruta de atención', 20], ['COMUNICACION_EMPATIA', 'Comunicación, empatía y trato profesional', 15],
    ['PAP', 'Aplicación de primeros auxilios psicológicos', 15], ['REFLEXION', 'Reflexión, bitácora y aprendizaje', 10],
  ] as const;
  const creada = await request.post('/api/rubrics/', {
    headers: { Authorization: `Bearer ${admin}` },
    data: {
      name: 'Rúbrica por defecto e2e', description: 'Para que la generación esté disponible en la base desechable.', version: '1.0',
      active: true, isDefault: true,
      criteria: criterios.map(([competency, title, weight], i) => ({ competency, title, weight, displayOrder: i + 1, active: true })),
    },
  });
  expect(creada.status(), `crear la rúbrica por defecto: ${await creada.text()}`).toBe(201);
  expect(await disponible(), 'con la rúbrica por defecto la generación queda disponible').toBe(true);
}
