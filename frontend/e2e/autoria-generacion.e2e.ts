import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import {
  DESCRIPCION_BIENESTAR, GENERACION_CON_PROVEEDOR_FALSO, MENSAJE_NEGATIVA_IA, MOTIVO_SIN_PROVEEDOR_FALSO, RECURSO_DE_APOYO, abrirGuion, abrirMiCaso,
  aprobarYPublicarPorApi, asegurarGeneracionDisponible, cancelarGeneracionAbierta, completarListaYEnviar, elegirDescribirTuCaso, entrarALaPrimeraSala,
  escribirRecursosDeApoyo, esperarCasoListo, generarConDescripcion, guardado, ponerFaltasDeOcl, retenerEscenas, rutaEditor, sinInfraccionesGraves,
  sugeridoPorLaIa,
} from './support/autoria-flujo';
import { PROFESOR, apiToken, assignCase, retireCase } from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * C2, tarea 12: la docente describe un caso, la IA lo arma por etapas con el proveedor FALSO de C1 (archivos fijos de la
 * universidad, sin red ni clave) y un estudiante lo juega. Todo va por la interfaz y contra el servidor real, salvo lo que se
 * aclara: las peticiones de escena se retienen con `page.route` para mirar el avance a mitad (la IA falsa contesta al
 * instante), y las faltas de OCL se dejan por la API (el editor no deja escribirlas, el servidor sí las guarda).
 *
 * El proveedor falso solo existe en el backend aislado del e2e: la prueba se salta si falta `SIEP_E2E_GENERACION=1`. El
 * proveedor falla SIEMPRE que la descripción lleva su marca (no recuerda nada entre llamadas), así que el reintento que sí
 * sigue se prueba aparte, con el primer intento de esqueleto respondido con la negativa y el segundo al servidor real.
 */
test.skip(!GENERACION_CON_PROVEEDOR_FALSO, MOTIVO_SIN_PROVEEDOR_FALSO);

type Json = Record<string, any>;

const TITULOS_DE_PARTE = ['esqueleto', 'escena-aula', 'escena-bienestar', 'escena-sala-espera', 'escena-consultorio', 'reglas'];

/** El editor del caso, tal como lo tiene el servidor. */
async function editorDe(request: Parameters<typeof apiToken>[0], token: string, id: number): Promise<Json> {
  const respuesta = await request.get(`/api/authoring/cases/${id}/editor`, { headers: { Authorization: `Bearer ${token}` } });
  expect(respuesta.status(), `editor del caso ${id}`).toBe(200);
  return (await respuesta.json()).data as Json;
}

/** Abre la revisión y espera a que el servidor termine de comprobar el caso: ya no dice «Comprobando el caso…» y las faltas listadas son todas. */
async function abrirRevisionComprobada(page: Page): Promise<Locator> {
  await page.goto(rutaEditor(page, '/revision'));
  const seccion = page.locator('section.por-resolver');
  await expect(seccion.getByRole('heading', { name: /^Por resolver \(\d+\)$/ })).toBeVisible({ timeout: scaled(30_000) });
  await expect(seccion.getByText('Comprobando el caso…')).toHaveCount(0, { timeout: scaled(30_000) });
  return seccion.getByRole('button', { name: /^Llévame ahí/ });
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pulsa cada «Llévame ahí» de «Por resolver» (uno por falta) y devuelve el `id` del elemento que recibió el foco y la dirección a la que llegó. */
async function anclasDeLasFaltas(page: Page): Promise<Array<{ ancla: string; url: string }>> {
  const cuantas = await (await abrirRevisionComprobada(page)).count();
  expect(cuantas, 'la revisión lista faltas').toBeGreaterThan(0);
  const anclas: Array<{ ancla: string; url: string }> = [];
  for (let i = 0; i < cuantas; i++) {
    const llevar = await abrirRevisionComprobada(page);
    await expect(llevar).toHaveCount(cuantas);
    await llevar.nth(i).click();
    await page.waitForFunction(() => !!document.activeElement && document.activeElement !== document.body, undefined, { timeout: scaled(15_000) });
    anclas.push({ ancla: await page.evaluate(() => document.activeElement?.id ?? ''), url: page.url() });
  }
  return anclas;
}

test.describe('@generacion la docente describe un caso y la IA lo arma con el proveedor falso', () => {
  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(scaled(240_000));
    await page.setViewportSize({ width: 1366, height: 800 });
    await asegurarGeneracionDisponible(request);
    await cancelarGeneracionAbierta(request);
    await loginAs(page, 'profesor');
  });

  test.afterEach(async ({ page, request }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await cancelarGeneracionAbierta(request);
  });

  // req: RF-12, RF-13, CU-05
  test('describe un caso, ve cómo se arma, lo revisa, lo envía y un estudiante lo juega', async ({ page, request }) => {
    test.setTimeout(scaled(900_000));
    let caseVersionId = 0;
    let asignacion: AssignmentRecord | undefined;
    try {
      // ── 1 · Describir el caso ──────────────────────────────────────────────────────────────────────────────────
      await elegirDescribirTuCaso(page);
      await sinInfraccionesGraves(page, 'el paso 2 con «Describe tu caso» elegido');
      const puerta = await retenerEscenas(page);
      await generarConDescripcion(page, DESCRIPCION_BIENESTAR);

      // ── 2 · El avance: a mitad (las dos primeras escenas en curso) y al final ──────────────────────────────────
      const avance = page.locator('.avance');
      await expect(avance.getByRole('status')).toHaveText('Escribiendo las escenas 1 y 2 de 4', { timeout: scaled(60_000) });
      await expect(page.locator('li.parte[data-parte="esqueleto"]')).toContainText(/✓.*Hecha/s);
      await expect(page.locator('li.parte[data-parte="escena-aula"]')).toContainText(/Escribiéndose/);
      await expect(page.locator('li.parte[data-parte="escena-bienestar"]')).toContainText(/Escribiéndose/);
      await expect(page.locator('li.parte[data-parte="escena-sala-espera"]')).toContainText(/Pendiente/);
      await expect(page.locator('li.parte[data-parte="escena-consultorio"]')).toContainText(/Pendiente/);
      await expect(page.getByText('1 de 6 partes hechas')).toBeVisible();
      await sinInfraccionesGraves(page, 'el avance a mitad de la generación');
      await puerta.soltar();

      await esperarCasoListo(page);
      for (const parte of TITULOS_DE_PARTE) await expect(page.locator(`li.parte[data-parte="${parte}"]`), `la parte «${parte}» dice «Hecha» en texto`).toContainText(/✓.*Hecha/s);
      await expect(page.locator('li.parte')).toHaveCount(TITULOS_DE_PARTE.length);
      await expect(avance.getByRole('alert')).toHaveCount(0);
      await sinInfraccionesGraves(page, 'el avance al terminar («Tu caso está listo como borrador»)');
      // No navega sola: se abre con el botón.
      await page.waitForTimeout(2_100);
      await expect(page).toHaveURL(/\/generando\//);
      caseVersionId = await abrirMiCaso(page);
      const docente = await apiToken(request, PROFESOR);
      const nEscenas = ((await editorDe(request, docente, caseVersionId))['nodes'] as Json[]).length;
      expect(nEscenas, 'el caso generado trae escenas').toBeGreaterThan(0);
      await expect(page.locator('button.escena')).toHaveCount(nEscenas, { timeout: scaled(30_000) });

      // ── 3 · La primera escena (la del inicio): lo que la IA escribió, en el guion ──────────────────────────────
      await abrirGuion(page, 1);
      await expect(page.getByLabel('Objetivo de la escena')).toHaveValue(/\S/, { timeout: scaled(30_000) });
      await expect(page.locator('textarea[id^="pista-texto-"]'), 'las tres pistas de la sala').toHaveCount(3);
      const apareceSi = page.getByRole('group', { name: 'Aparece si…' }).filter({ has: page.getByRole('checkbox', { checked: true }) });
      await expect(apareceSi, 'una respuesta con «Aparece si…» y su casilla marcada').toHaveCount(1);
      await expect(page.getByRole('group', { name: 'Cómo reacciona' }), 'las cuatro respuestas traen cómo reacciona el personaje').toHaveCount(4);
      await expect(page.locator('fieldset.reaccion textarea').first(), 'la frase con la que reacciona').toHaveValue(/\S/);
      await expect(page.locator('fieldset.reaccion .vista img').first(), 'la vista previa de su cara').toHaveAttribute('alt', /^Cara: /);
      await expect(page.getByRole('heading', { name: 'Lo que dicen al acercarte' })).toBeVisible();
      await expect(page.locator('input[id^="comentario-"][id$="-texto"]'), 'dos comentarios al acercarte').toHaveCount(2);
      await sinInfraccionesGraves(page, 'el guion de la primera escena generada');

      // ── 4 · Aceptar lo sugerido por la IA, escena por escena ───────────────────────────────────────────────────
      const pendientes = await sugeridoPorLaIa(request, docente, caseVersionId);
      expect(pendientes, 'el caso recién generado trae partes sugeridas por la IA').toBeGreaterThan(0);
      for (let escena = 1; escena <= nEscenas; escena++) {
        await abrirGuion(page, escena);
        const aceptar = page.getByRole('button', { name: /^Aceptar toda la escena/ });
        await expect(aceptar, `la escena ${escena} ofrece aceptar lo sugerido`).toBeVisible({ timeout: scaled(30_000) });
        await aceptar.click();
        await expect(aceptar).toHaveCount(0, { timeout: scaled(30_000) });
        await guardado(page);
      }
      // Los finales que propuso la IA se aceptan en su pantalla, uno por uno.
      await page.goto(rutaEditor(page, '/finales'));
      const aceptarFinal = page.getByRole('button', { name: 'Aceptar final' });
      await expect(aceptarFinal.first(), 'los finales de la IA esperan su aceptación').toBeVisible({ timeout: scaled(30_000) });
      while (await aceptarFinal.count() > 0) {
        const quedan = await aceptarFinal.count();
        await aceptarFinal.first().click();
        await expect(aceptarFinal).toHaveCount(quedan - 1, { timeout: scaled(30_000) });
        await guardado(page);
      }
      expect(await sugeridoPorLaIa(request, docente, caseVersionId), 'no queda nada sugerido por la IA sin revisar').toBe(0);

      // ── 5 · La revisión: las faltas de OCL-09 a OCL-12 llevan a lo concreto ────────────────────────────────────
      const faltas = await ponerFaltasDeOcl(request, docente, caseVersionId);
      const anclas = await anclasDeLasFaltas(page);
      expect(anclas.map((a) => a.ancla), '«Llévame ahí» abre la escena y da el foco a lo exacto: el «Aparece si…», el «Cómo reacciona» y el comentario').toEqual(
        expect.arrayContaining([`aparece-si-${faltas.requisito}`, `reaccion-${faltas.reaccion}`, `comentario-${faltas.comentario}`]),
      );
      // Y la escena que se abrió es la correcta: las tres faltas puestas están en la primera (la del inicio).
      const escenaInicio = (await editorDe(request, docente, caseVersionId))['nodes'].find((n: Json) => n['startNode']) as Json;
      for (const esperada of [`aparece-si-${faltas.requisito}`, `reaccion-${faltas.reaccion}`, `comentario-${faltas.comentario}`]) {
        const llegada = anclas.find((a) => a.ancla === esperada)!;
        expect(llegada.url, `«Llévame ahí» de ${esperada} abre el guion de la escena del inicio`)
          .toMatch(new RegExp(`/editor/escena/(?:${escapar(String(escenaInicio['key']))}|${escenaInicio['id']})(?:[?#]|$)`));
      }
      await page.goto(rutaEditor(page, '/revision'));
      await expect(page.getByRole('heading', { name: /^Por resolver \([1-9]\d*\)$/ })).toBeVisible({ timeout: scaled(30_000) });
      await sinInfraccionesGraves(page, 'la revisión con faltas de OCL');
      await faltas.deshacer();

      // Lo que el proveedor falso deje sin resolver (hoy: hitos que ninguna respuesta marca y un final inalcanzable; mañana, quizá
      // nada): la docente resuelve, una a una, las faltas que la revisión liste en ese momento, sean cero o más, hasta que no queden.
      // No se nombra ninguna falta, final ni hito del archivo del proveedor: todo sale de lo que dicen la revisión y el propio caso.
      const hitosDelCaso = ((await editorDe(request, docente, caseVersionId))['rules']['milestones'] as Json[]).map((h) => String(h['label']));
      const MAX_VUELTAS = 12;
      for (let vuelta = 0; ; vuelta++) {
        const todas = await (await abrirRevisionComprobada(page)).evaluateAll((botones) => botones.map((b) => b.getAttribute('aria-label') ?? ''));
        // La lista de verificación no es del caso sino de la docente: se marca más abajo, al enviar.
        const etiquetas = todas.filter((e) => !/lista de verificación/i.test(e));
        if (etiquetas.length === 0) break;
        expect(vuelta, `la revisión sigue listando faltas tras ${MAX_VUELTAS} arreglos: ${etiquetas.join(' | ')}`).toBeLessThan(MAX_VUELTAS);
        const falta = etiquetas[0];
        const final = /^Llévame ahí: El final «(.+?)»/.exec(falta);
        if (/no se puede cumplir/.test(falta)) {
          // Un hito que ninguna respuesta marca: se marca en la primera respuesta de la primera escena (el caso empieza ahí).
          const hito = hitosDelCaso.filter((h) => falta.includes(h)).sort((a, b) => b.length - a.length)[0];
          expect(hito, `la falta «${falta}» nombra un hito del caso`).toBeTruthy();
          await abrirGuion(page, 1);
          await page.locator('li.respuesta').first().getByRole('checkbox', { name: hito, exact: true }).check();
          await guardado(page);
        } else if (final) {
          // Un final al que nadie llega: «Llévame ahí» lo abre con el foco puesto y la docente lo borra.
          await page.getByRole('button', { name: falta }).click();
          await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? ''), { timeout: scaled(15_000) }).toMatch(/^final-/);
          await page.getByRole('button', { name: `Borrar el final ${final[1]}` }).click();
          await guardado(page);
        } else {
          throw new Error(`La revisión lista una falta que esta prueba no sabe resolver como docente: «${falta}»`);
        }
      }

      // La lista de verificación marca «protocolos de seguridad»: el caso necesita un recurso de apoyo (el proveedor no los escribe).
      await abrirGuion(page, 1);
      await escribirRecursosDeApoyo(page, RECURSO_DE_APOYO);
      await completarListaYEnviar(page);

      // ── 6 · Psicología lo aprueba y lo publica, y el estudiante lo juega ───────────────────────────────────────
      await aprobarYPublicarPorApi(request, caseVersionId);
      asignacion = await assignCase(request, caseVersionId);
      await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
      await entrarALaPrimeraSala(page);
      await expect(page.locator('app-simulation-play').getByText(`Escenario 1 de ${nEscenas}`).first()).toBeVisible({ timeout: scaled(30_000) });
      await sinInfraccionesGraves(page, 'la primera sala del caso generado, vista por el estudiante');
    } finally {
      if (caseVersionId) await retireCase(request, caseVersionId, asignacion ? [asignacion] : []);
    }
  });

  // req: RF-12
  test('la IA se niega: el error sale junto a la parte, con «Reintentar esta parte», y no deja la pantalla en blanco', async ({ page }) => {
    let pedidas = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/generations\/[^/]+\/skeleton$/.test(new URL(r.url()).pathname)) pedidas++; });
    await elegirDescribirTuCaso(page);
    await generarConDescripcion(page, `${DESCRIPCION_BIENESTAR} [falso:refusal]`);
    const esqueleto = page.locator('li.parte[data-parte="esqueleto"]');
    await expect(esqueleto.getByRole('alert')).toContainText(MENSAJE_NEGATIVA_IA, { timeout: scaled(60_000) });
    await expect(esqueleto).toContainText(/!.*Con error/s);
    const reintentar = esqueleto.getByRole('button', { name: 'Reintentar esta parte' });
    await expect(reintentar).toBeVisible();
    await sinInfraccionesGraves(page, 'el avance con el error de la negativa de la IA');
    // El proveedor falso se niega cada vez que ve la marca: al reintentar la parte se vuelve a pedir y vuelve el mismo error.
    expect(pedidas, 'una negativa no se reintenta sola').toBe(1);
    await reintentar.click();
    await expect.poll(() => pedidas, { timeout: scaled(30_000) }).toBe(2);
    await expect(esqueleto.getByRole('alert')).toContainText(MENSAJE_NEGATIVA_IA);
    await expect(esqueleto.getByRole('button', { name: 'Reintentar esta parte' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar y empezar de nuevo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /¿Dónde pasa tu caso\?|Elige las salas de tu caso/ })).toBeVisible({ timeout: scaled(30_000) });
  });

  // req: RF-12
  test('tras la negativa de la IA, «Reintentar esta parte» pide la parte otra vez y el caso sigue hasta quedar listo', async ({ page, request }) => {
    let caseVersionId = 0;
    try {
      // El proveedor falso no falla «solo la primera vez»: la primera petición del esqueleto se responde aquí con el mismo
      // 422 de la negativa que da el servidor, y la segunda sí llega a él.
      let pedidas = 0;
      await page.route('**/api/authoring/generations/*/skeleton', async (ruta) => {
        if (++pedidas === 1) {
          await ruta.fulfill({ status: 422, json: { success: false, code: 'AI_REFUSED', message: MENSAJE_NEGATIVA_IA } });
        } else {
          await ruta.continue();
        }
      });
      await elegirDescribirTuCaso(page);
      await generarConDescripcion(page, DESCRIPCION_BIENESTAR);
      const esqueleto = page.locator('li.parte[data-parte="esqueleto"]');
      await expect(esqueleto.getByRole('alert')).toContainText(MENSAJE_NEGATIVA_IA, { timeout: scaled(60_000) });
      await sinInfraccionesGraves(page, 'el avance con el error de una parte');
      await esqueleto.getByRole('button', { name: 'Reintentar esta parte' }).click();
      await esperarCasoListo(page);
      expect(pedidas, 'el esqueleto se pidió dos veces: la que se negó y el reintento').toBe(2);
      await expect(page.locator('li.parte[data-parte="esqueleto"]')).toContainText(/✓.*Hecha/s);
      await expect(page.locator('.avance').getByRole('alert')).toHaveCount(0);
      caseVersionId = await abrirMiCaso(page);
    } finally {
      if (caseVersionId) await retireCase(request, caseVersionId);
    }
  });
});
