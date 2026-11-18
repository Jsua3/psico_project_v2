import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  RECURSO_DE_APOYO, abrirGuion, completarListaYEnviar, crearCasoBienestar, entrarALaPrimeraSala, escribirCasoBienestar, guardado,
  hacerQueVayaYVenga, marcarPersonaAAtender, rutaEditor, sinInfraccionesGraves,
} from './support/autoria-flujo';
import { ADMIN, PROFESOR, apiToken, assignCase, bearer, retireCase, send } from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import { measuresIn, measuresInText, recordSimulationResponses, retiredKeysIn, shapeOf } from './support/no-numbers';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * El recorrido completo de un docente en el editor nuevo (P6, tarea 8), contra el servidor REAL y por la interfaz:
 *
 * 1. Una docente crea un caso desde la universidad con el recorrido «Atención en Bienestar», escribe tres escenas (una
 *    respuesta Contraindicada con su razón), escribe el contexto y los objetivos del caso, elige dos hitos decisivos, marca a la
 *    persona a atender y hace que vaya y venga (todo en la sala del editor, con teclas), acepta una propuesta del asistente
 *    de IA, prueba el caso como estudiante, completa la lista de verificación y lo envía a revisión.
 * 2. Un docente solo ve y edita lo suyo: el caso de otra persona no aparece en su lista y el servidor le niega abrirlo.
 * 3. Un administrador lo aprueba y lo publica (la decisión se toma en la pantalla de revisión del mismo editor).
 * 4. Un estudiante juega la primera sala y ve a la persona a atender resaltada.
 *
 * El asistente de IA es el único doble: la prueba intercepta `assistant/status` y `assistant/propose` (el servidor lo trae
 * apagado y no hay clave) y responde una propuesta fija; aplicarla, aceptarla y todo lo demás van al servidor real. En cada
 * paso, Axe (WCAG 2.2 AA) no ve nada serio ni crítico, y el estudiante no recibe ninguna cifra (regla de la Tarea 17).
 */
type Json = Record<string, any>;

const toast = (page: Page, texto: string) => page.getByLabel('Mensajes del sistema').getByText(texto);
const HITOS_DECISIVOS = ['Informar derechos', 'Recomendar medidas de protección'];

/** La primera persona de la primera sala, tal como la tiene el servidor. */
async function personaDeLaPrimeraSala(request: Parameters<typeof apiToken>[0], token: string, caseVersionId: number): Promise<Json> {
  const editor = (await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(token) })).json()).data as Json;
  const nodo = (editor['nodes'] as Json[])[0]['id'];
  const mundo = (await (await request.get(`/api/authoring/cases/${caseVersionId}/world-editor?nodeId=${nodo}`, { headers: bearer(token) })).json()).data as Json;
  return (mundo['objects'] as Json[]).find((o) => o['type'] === 'PERSON')!;
}

/** La docente ve en su lista solo lo suyo, y el servidor le niega abrir el caso de otra persona. */
async function soloVeLoSuyo(page: Page, request: Parameters<typeof apiToken>[0], ajeno: number): Promise<void> {
  const docente = await apiToken(request, PROFESOR);
  const lista = (await (await request.get('/api/authoring/cases', { headers: bearer(docente) })).json()).data as Json[];
  expect(lista.map((caso) => caso['caseVersionId']), 'la lista de la docente no trae el caso de otra persona').not.toContain(ajeno);
  const abierto = await request.get(`/api/authoring/cases/${ajeno}/editor`, { headers: bearer(docente) });
  expect([403, 404], 'el servidor le niega a la docente abrir el caso de otra persona').toContain(abierto.status());
  const publicar = await request.post(`/api/authoring/cases/${ajeno}/lifecycle`, { headers: bearer(docente), data: { action: 'approve' } });
  expect(publicar.status(), 'la docente tampoco puede aprobar').toBeGreaterThanOrEqual(400);

  await page.goto(`/portal/casos/${ajeno}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: 'No pudimos abrir el caso' })).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.getByText(/No encontramos ese caso|No pudimos abrir el caso./).first()).toBeVisible();
  await sinInfraccionesGraves(page, 'el caso de otra persona (sin permiso)');
}

// req: RF-12, RF-13, CU-05, RNF-004
test('un docente crea, prueba y envía un caso; la administradora lo aprueba y un estudiante lo juega', async ({ page, request }) => {
  test.setTimeout(scaled(900_000));
  await page.setViewportSize({ width: 1366, height: 800 });
  let caseVersionId = 0;
  let ajeno = 0;
  let asignacion: AssignmentRecord | undefined;
  try {
    // ── El caso de otra persona (una administradora) y lo que la docente puede hacer con él ───────────────────────
    const admin = await apiToken(request, ADMIN);
    ajeno = (await send(request, admin, 'post', '/api/authoring/cases', { title: `Caso de otra persona e2e ${Date.now()}`, description: 'Un caso que no es de la docente.' }, 'crear el caso de otra persona'))['caseVersionId'];
    await loginAs(page, 'profesor');
    await soloVeLoSuyo(page, request, ajeno);

    // ── 1 · Crear el caso desde la universidad ───────────────────────────────────────────────────────────────────
    caseVersionId = await crearCasoBienestar(page, `Atención en Bienestar e2e ${Date.now()}`);
    await sinInfraccionesGraves(page, 'el mapa del caso recién creado');
    const docente = await apiToken(request, PROFESOR);

    // ── 2 · Escribir tres escenas (una respuesta contraindicada con su razón) ────────────────────────────────────
    await escribirCasoBienestar(page, (paso) => sinInfraccionesGraves(page, paso));
    const editor = (await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(docente) })).json()).data as Json;
    const respuestas = editor['decisions'] as Json[];
    expect(respuestas.map((r) => r['responseClass']).sort(), 'dos respuestas por escena, una de ellas contraindicada').toEqual(
      ['CONTRAINDICATED', 'RECOMMENDED', 'RECOMMENDED', 'RISKY'],
    );
    const contraindicada = respuestas.find((r) => r['responseClass'] === 'CONTRAINDICATED')!;
    expect(String(contraindicada['prohibitionReason']), 'la contraindicada trae su razón').toContain('deja sin apoyo');
    expect((editor['nodes'] as Json[]).some((n) => (n['supportResources'] as string[]).includes(RECURSO_DE_APOYO)), 'una escena trae su recurso de apoyo').toBe(true);

    // ── 2b · Los datos del caso: el contexto que lee el estudiante y los objetivos de aprendizaje ───────────────
    const contexto = 'Una estudiante llega a Bienestar Universitario y no sabe si entrar. Tú la recibes.';
    await page.goto(rutaEditor(page, '/datos'));
    await expect(page.getByRole('heading', { level: 1, name: 'Datos del caso' })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByLabel('Nombre del caso')).toHaveAttribute('readonly', '');
    await page.getByLabel('Contexto que lee el estudiante').fill(contexto);
    await page.getByLabel('Objetivos de aprendizaje').fill('Valorar el riesgo.\nInformar sus derechos.');
    await page.getByRole('button', { name: 'Guardar los datos del caso' }).click();
    await expect(page.locator('[data-estado-datos]')).toHaveText('Los datos del caso se guardaron.', { timeout: scaled(30_000) });
    await sinInfraccionesGraves(page, 'los datos del caso');
    const conFicha = (await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(docente) })).json()).data as Json;
    expect(conFicha['context'], 'el servidor guardó el contexto').toBe(contexto);
    expect(conFicha['learningObjectives'], 'el servidor guardó los objetivos, uno por renglón').toEqual(['Valorar el riesgo.', 'Informar sus derechos.']);
    // Un contexto con etiquetas no se guarda: el editor lo dice en el campo y el foco va a él.
    await page.getByLabel('Contexto que lee el estudiante').fill('Entra por <b>esta</b> puerta.');
    await page.getByRole('button', { name: 'Guardar los datos del caso' }).click();
    await expect(page.getByText('Escribe texto plano, sin etiquetas ni formato.')).toBeVisible();
    await expect(page.getByLabel('Contexto que lee el estudiante')).toBeFocused();
    await sinInfraccionesGraves(page, 'los datos del caso con un error en el contexto');
    await page.getByLabel('Contexto que lee el estudiante').fill(contexto);

    // ── 3 · Dos hitos decisivos ──────────────────────────────────────────────────────────────────────────────────
    await page.goto(rutaEditor(page, '/finales'));
    const decisivos = page.getByRole('group', { name: 'Hitos que deciden el final' });
    await expect(decisivos).toBeVisible({ timeout: scaled(30_000) });
    for (const casilla of await decisivos.getByRole('checkbox').all()) {
      const nombre = ((await casilla.evaluate((el) => el.parentElement?.textContent ?? '')) as string).trim();
      if (HITOS_DECISIVOS.includes(nombre) !== (await casilla.isChecked())) {
        await (HITOS_DECISIVOS.includes(nombre) ? casilla.check() : casilla.uncheck());
        await guardado(page);
      }
    }
    for (const hito of HITOS_DECISIVOS) await expect(decisivos.getByRole('checkbox', { name: hito, exact: true })).toBeChecked();
    await expect(decisivos.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await sinInfraccionesGraves(page, 'los finales con dos hitos decisivos');
    const conHitos = (await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(docente) })).json()).data as Json;
    expect((conHitos['rules'] as Json)['milestones'].filter((h: Json) => h['decisive']).map((h: Json) => h['label']).sort(), 'el servidor guardó los dos decisivos').toEqual([...HITOS_DECISIVOS].sort());

    // ── 4 · Aceptar una propuesta del asistente de IA (el proveedor es el único doble) ───────────────────────────────
    const [primeraEscena, segundaEscena]: number[] = (editor['nodes'] as Json[]).map((n) => n['id']);
    const propuestas: string[] = [];
    await page.route('**/api/authoring/cases/*/assistant/status', (ruta) => ruta.fulfill({ json: { success: true, data: { enabled: true, mode: 'connected', remainingToday: 5 } } }));
    await page.route('**/api/authoring/cases/*/assistant/propose', (ruta) => {
      propuestas.push(ruta.request().postData() ?? '');
      return ruta.fulfill({
        json: {
          success: true,
          data: {
            mensaje: 'Te propongo una respuesta más para la primera escena: preguntarle cómo se siente.', changes: 1, model: 'simulado-e2e', modo: 'connected',
            cambios: [{
              op: 'add-response', nodeId: primeraEscena, targetNodeId: segundaEscena, responseClass: 'ACCEPTABLE', prohibitionReason: '',
              text: 'Pregúntale cómo se siente y qué necesita ahora.', feedbackText: 'Preguntar abre la conversación sin presionar.',
            }],
          },
        },
      });
    });
    await abrirGuion(page, 1);
    await page.getByRole('group', { name: 'Ayuda' }).getByRole('button', { name: 'Asistente de IA' }).click();
    const panel = page.getByRole('complementary', { name: 'Asistente de IA' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Hoy te quedan 5 ayudas.')).toBeVisible({ timeout: scaled(15_000) });
    await panel.getByLabel('Pídele algo al asistente').fill('Agrega una respuesta en la que le preguntes cómo se siente.');
    await panel.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(panel.getByText('Te propongo una respuesta más')).toBeVisible({ timeout: scaled(15_000) });
    expect(propuestas, 'la petición llegó a la propuesta con la pantalla y la escena').toHaveLength(1);
    expect(JSON.parse(propuestas[0])).toMatchObject({ pantalla: 'guion' });
    await expect(panel.getByRole('checkbox')).toHaveCount(1);
    await sinInfraccionesGraves(page, 'el asistente de IA con una propuesta');
    await panel.getByRole('button', { name: 'Aplicar lo marcado' }).click();
    const sugerida = page.locator('li.respuesta', { hasText: 'Sugerido por la IA' });
    await expect(sugerida).toHaveCount(1, { timeout: scaled(30_000) });
    await expect(sugerida.getByLabel(/^Respuesta \d/)).toHaveValue('Pregúntale cómo se siente y qué necesita ahora.');
    await guardado(page);
    // Lo que la IA agrega queda marcado hasta que la docente lo acepta; aceptarlo llama de verdad al servidor.
    await sinInfraccionesGraves(page, 'el guion con una respuesta sugerida por la IA');
    const aceptada = page.waitForResponse((r) => r.request().method() === 'POST' && /\/decisions\/\d+\/accept-ai$/.test(new URL(r.url()).pathname), { timeout: scaled(30_000) });
    await sugerida.getByRole('button', { name: 'Aceptar respuesta' }).click();
    expect((await aceptada).status(), 'el servidor registró la revisión de la respuesta').toBe(200);
    await expect(page.locator('li.respuesta', { hasText: 'Sugerido por la IA' })).toHaveCount(0);
    await guardado(page);
    await page.getByRole('button', { name: 'Cerrar el asistente' }).click();
    await page.unroute('**/api/authoring/cases/*/assistant/propose');
    await page.unroute('**/api/authoring/cases/*/assistant/status');

    // ── 5 · Probar: el botón de la escena abre el ensayo del juego real en otra pestaña (el recorrido lo prueba el e2e del bloque B) ──
    await page.goto(rutaEditor(page, `/escena/${primeraEscena}`));
    const probarDesdeAqui = page.getByRole('link', { name: /^Probar desde aquí/ });
    await expect(probarDesdeAqui).toBeVisible({ timeout: scaled(30_000) });
    await expect(probarDesdeAqui).toHaveAttribute('target', '_blank');
    await expect(probarDesdeAqui).toHaveAttribute('href', `/portal/casos/${caseVersionId}/ensayo?desde=${primeraEscena}`);
    await sinInfraccionesGraves(page, 'el guion con «Probar desde aquí»');

    // ── 6 · La persona a atender y cómo se mueve, en la sala del editor y con teclas (sin arrastrar, sin la API) ─────
    const persona = await marcarPersonaAAtender(page);
    await sinInfraccionesGraves(page, 'la sala con la persona a atender marcada');
    await hacerQueVayaYVenga(page);
    await sinInfraccionesGraves(page, 'la sala con una persona que va y viene');
    const guardada = await personaDeLaPrimeraSala(request, docente, caseVersionId);
    expect(guardada['metadata']['personaClave'], 'el servidor guardó a la persona a atender').toBe(true);
    expect(guardada['metadata']['movimiento'], 'el servidor guardó que va y viene hasta un punto').toMatchObject({ tipo: 'va-y-viene', hasta: { x: expect.any(Number), y: expect.any(Number) } });
    expect(guardada['label']).toBe(persona);

    // ── 7 · Lista de verificación y envío a revisión ─────────────────────────────────────────────────────────────
    await page.goto(rutaEditor(page, '/revision'));
    await expect(page.getByRole('heading', { name: /^Por resolver \(\d+\)$/ })).toBeVisible({ timeout: scaled(30_000) });
    await sinInfraccionesGraves(page, 'la revisión antes de enviar');
    await completarListaYEnviar(page);
    await sinInfraccionesGraves(page, 'la revisión con el caso en manos de Psicología');
    const ciclo = (await (await request.get(`/api/authoring/cases/${caseVersionId}/lifecycle`, { headers: bearer(docente) })).json()).data as Json;
    expect(ciclo['state'], 'el servidor tiene el caso en revisión').toBe('IN_REVIEW');
    // La docente envía lo suyo pero no lo aprueba ni lo devuelve: lo decide el servidor, y la pantalla no lo ofrece.
    await expect(page.getByRole('button', { name: /Aprobar y publicar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Devolver a borrador/ })).toHaveCount(0);
    const intento = await request.post(`/api/authoring/cases/${caseVersionId}/lifecycle`, { headers: bearer(docente), data: { action: 'approve' } });
    expect(intento.status(), 'el servidor le niega aprobar a la docente').toBeGreaterThanOrEqual(400);

    // ── 8 · La administradora lo aprueba y lo publica, en la pantalla de revisión del editor ─────────────────────
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await loginAs(page, 'admin');
    await page.goto(`/portal/casos/${caseVersionId}/editor/revision`);
    const decision = page.locator('[data-accion="decision-caso"]');
    await expect(decision.getByRole('heading', { name: 'Estado y decisión del caso' })).toBeVisible({ timeout: scaled(30_000) });
    await expect(decision.locator('ui-badge').first()).toHaveText('En revisión', { timeout: scaled(30_000) });
    await sinInfraccionesGraves(page, 'la decisión sobre el caso');
    await decision.getByRole('button', { name: 'Aprobar y publicar' }).click();
    const aprobar = page.getByRole('dialog', { name: 'Aprobar y publicar' });
    await expect(aprobar).toBeVisible();
    await sinInfraccionesGraves(page, 'el cuadro de aprobar y publicar');
    await aprobar.getByLabel('Nota (opcional)').fill('Cumple con lo acordado.');
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const iso = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    await aprobar.getByLabel('Quién revisó').fill('Dra. Ruiz');
    await aprobar.getByLabel('Fecha de la revisión').fill(iso);
    await aprobar.getByLabel('Referencia o acta').fill('Acta 4 de Psicología');
    await aprobar.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await expect(toast(page, 'El caso se publicó.')).toBeVisible({ timeout: scaled(30_000) });
    await expect(decision.locator('ui-badge').first()).toHaveText('Publicado', { timeout: scaled(30_000) });
    // Publicado, el editor lo muestra como publicado y ofrece crear una versión nueva (un caso publicado no se cambia).
    await expect(page.getByText('El caso está publicado. Se puede ver, pero no editar.').first()).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByRole('button', { name: 'Crear una versión nueva' })).toBeVisible({ timeout: scaled(30_000) });
    await sinInfraccionesGraves(page, 'el caso publicado');
    const publicado = (await (await request.get(`/api/authoring/cases/${caseVersionId}/lifecycle`, { headers: bearer(admin) })).json()).data as Json;
    expect(publicado['state'], 'el servidor lo tiene publicado').toBe('PUBLISHED');

    // ── 9 · El estudiante juega la primera sala ──────────────────────────────────────────────────────────────────
    asignacion = await assignCase(request, caseVersionId);
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    const registro = recordSimulationResponses(page);
    await entrarALaPrimeraSala(page);
    // La sala ocupa la pantalla (b28adb40): ya no hay contador «Escenario 1 de 3»; la ficha dice el objetivo de la escena.
    await expect(page.locator('app-simulation-play').getByText('Objetivo de la escena').first()).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.locator('app-simulation-play').getByText(/Escenario \d+ de \d+/)).toHaveCount(0);
    await sinInfraccionesGraves(page, 'la primera sala vista por el estudiante');
    const acceso = page.locator('button[data-hud-places]');
    await acceso.focus();
    await page.keyboard.press('Enter');
    const lista = page.getByRole('dialog', { name: /ir a…/i });
    await expect(lista.getByRole('button', { name: new RegExp(`${persona.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*persona a atender`, 'i') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lista).toBeHidden();
    // El juego dibuja el chevrón con su nombre sobre la cabeza de la persona a atender (vive en el lienzo; el juego lo publica en su host).
    await expect(page.locator('app-game-world .phaser-host')).toHaveAttribute('data-key-person', persona, { timeout: scaled(15_000) });
    expect(measuresInText(await page.locator('app-simulation-play').first().innerText()), 'el estudiante no lee cifras de desempeño').toEqual([]);
    expect(retiredKeysIn(registro.records), 'ninguna clave del modelo numérico viejo llegó al estudiante').toEqual([]);
    expect(measuresIn(registro.records).map((m) => `${shapeOf(m.where)} → ${m.key}=${m.value}`), 'ninguna medida llegó al estudiante').toEqual([]);
  } finally {
    if (caseVersionId) await retireCase(request, caseVersionId, asignacion ? [asignacion] : []);
    if (ajeno) await retireCase(request, ajeno);
  }
});
