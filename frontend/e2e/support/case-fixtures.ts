import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Casos de prueba con datos controlados, creados por la API REAL de la base desechable (sin `page.route`): un caso
 * publicado con su ficha (contexto, objetivos y personajes), asignado al grupo del estudiante de la semilla. Lo usan
 * las pruebas de las interfaces enlazadas (F10-1 ficha, F10-5 asignaciones) que necesitan datos que la semilla no trae.
 *
 * Un caso publicado entra en la secuencia del estudiante: por defecto se asigna con `sortOrder` 0 y lo que ya estaba
 * asignado con ese orden (el caso de la semilla) pasa detrás, así el caso nuevo queda primero y abierto. `retireCase`
 * lo deshace al terminar (apaga la asignación, devuelve el orden anterior y archiva la versión), pase o falle la prueba.
 */
type Json = Record<string, any>;

interface Login { email: string; password: string }

export const ADMIN: Login = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};
export const PROFESOR: Login = {
  email: process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co',
  password: process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!',
};
export const ESTUDIANTE: Login = {
  email: process.env['E2E_STUDENT_EMAIL'] ?? 'estudiante@psychosim.edu.co',
  password: process.env['E2E_STUDENT_PASSWORD'] ?? 'Estudiante123!',
};

export interface FixtureCharacter {
  characterKey: string;
  displayName: string;
  roleLabel: string;
  /** Clave del kit de personajes (`catalog.actors`), p. ej. `enfermera-urgencias`. */
  portraitKey: string;
}

export interface CaseFixtureOptions {
  title: string;
  context?: string;
  learningObjectives?: string[];
  characters?: FixtureCharacter[];
  /** Una escena con contenido sensible: la ficha avisa antes de entrar. */
  sensitive?: boolean;
}

export interface CaseFixture { caseVersionId: number; title: string }

export interface AssignmentWindow {
  groupId?: number;
  /** Entero de 0 a 1000; menor = antes en la secuencia del estudiante. Por defecto 0 (el primero). */
  sortOrder?: number;
  /** ISO 8601, hora de Bogotá sin zona (p. ej. `2026-10-20T08:00:00`). */
  opensAt?: string | null;
  closesAt?: string | null;
}

export async function apiToken(request: APIRequestContext, who: Login): Promise<string> {
  const response = await request.post('/api/auth/login', { data: who });
  expect(response.status(), `login de ${who.email} por API`).toBe(200);
  return (await response.json()).data.token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * La revisión del caso (bloqueo optimista, E2-6; `SIEP_REVISION_REQUIRED` la hace obligatoria): viaja en `X-Case-Revision`
 * en toda mutación de autoría y cada respuesta del editor trae la siguiente. Es la misma que manda el cliente de la
 * interfaz (`AuthoringApi`); aquí la lleva la suite por cada versión que edita: un caso nuevo no tiene ninguna.
 */
export const CASE_REVISION_HEADER = 'X-Case-Revision';
const revisions = new Map<number, number>();
const CASE_IN_URL = /\/api\/(?:authoring|admin)\/cases\/(\d+)/;

/** Recuerda la revisión que trae una respuesta del editor (las demás respuestas no la traen y no cambian nada). */
function adoptRevision(body: Json | null | undefined): void {
  if (typeof body?.['caseVersionId'] === 'number' && typeof body['revision'] === 'number') {
    revisions.set(body['caseVersionId'], body['revision']);
  }
}

/** El editor de la versión, tal como está ahora; de paso recuerda su revisión. */
export async function readEditor(request: APIRequestContext, token: string, id: number): Promise<Json> {
  const response = await request.get(`/api/authoring/cases/${id}/editor`, { headers: bearer(token) });
  expect(response.status(), `editor del caso ${id}`).toBe(200);
  const view = (await response.json()).data;
  adoptRevision(view);
  return view;
}

/** Los encabezados de una mutación del caso al que apunta `url`: el token y la revisión vigente, si ya se conoce. */
function mutationHeaders(token: string, url: string): Record<string, string> {
  const revision = revisions.get(Number(CASE_IN_URL.exec(url)?.[1]));
  return revision === undefined ? bearer(token) : { ...bearer(token), [CASE_REVISION_HEADER]: String(revision) };
}

/**
 * La constancia de la revisión de contenido de Psicología (RQ-NEG-008): con `SIEP_REVIEW_WORKFLOW_STRICT` el servidor no
 * aprueba sin ella (400 `CONTENT_REVIEW_REQUIRED`) y sin la bandera la acepta y la guarda. La fecha es la de ayer: el
 * servidor rechaza una posterior a hoy y la hora local del servidor y la de esta máquina pueden quedar a un día.
 */
export function contentReviewProof(): { reviewer: string; reviewedOn: string; reference: string } {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const two = (value: number) => String(value).padStart(2, '0');
  return {
    reviewer: 'Revisión e2e',
    reviewedOn: `${yesterday.getFullYear()}-${two(yesterday.getMonth() + 1)}-${two(yesterday.getDate())}`,
    reference: 'Acta e2e',
  };
}

/**
 * Una mutación por la API real que espera un éxito (200 o 201) y devuelve su `data`. Manda la revisión del caso y adopta
 * la de la respuesta. Las del ciclo de vida no la traen (responden `CaseLifecycle`): después se relee el editor.
 */
export async function send(
  request: APIRequestContext, token: string, method: 'post' | 'put' | 'patch' | 'delete', url: string, data: Json, what: string,
): Promise<Json> {
  const response = await request[method](url, { headers: mutationHeaders(token, url), data });
  expect([200, 201], `${what}: ${response.status()} ${await response.text().catch(() => '')}`).toContain(response.status());
  const body = (await response.json()).data;
  adoptRevision(body);
  if (url.endsWith('/lifecycle') && typeof body?.['caseVersionId'] === 'number') await readEditor(request, token, body['caseVersionId']);
  return body;
}

/**
 * Una transición del ciclo de vida que NO tiene que salir bien (limpiezas): relee la revisión antes de mandarla, así un
 * caso que otra cosa tocó a medias no se queda publicado por una revisión vencida. Devuelve la respuesta tal cual.
 */
export async function transition(request: APIRequestContext, token: string, id: number, data: Json) {
  await readEditor(request, token, id).catch(() => undefined);
  const url = `/api/authoring/cases/${id}/lifecycle`;
  return request.post(url, { headers: mutationHeaders(token, url), data });
}

const NODE_BODY = {
  requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false,
  warningMessage: null, terminal: false, startNode: false, positionX: null, positionY: null,
};

/**
 * Un recurso de apoyo de prueba. La lista de publicación de estos casos marca «protocolos de seguridad» y el servidor
 * (S3-3) no deja enviar a revisión ni publicar sin al menos una escena con un recurso con texto. A propósito no parece uno
 * real: los reales los entrega y verifica Psicología.
 */
const SUPPORT_RESOURCE = 'Recurso de apoyo de prueba (no verificado)';

export interface DraftOptions {
  title: string;
  /** La descripción del caso (E4: OCL-07 la exige); es también el contexto que lee el estudiante. */
  description?: string;
  /** Una escena con contenido sensible: la ficha avisa antes de entrar. */
  sensitive?: boolean;
}

const DEFAULT_DESCRIPTION = 'Caso de prueba: una decisión de dos opciones que llevan al cierre.';

/**
 * Un borrador que el validador de E4 acepta, listo para enviar a revisión y publicar: dos escenas unidas por una decisión
 * de DOS opciones (OCL-02), cada una con su retroalimentación escrita (E3: sin ella es un aviso de validación) y un objeto
 * del mapa que la ofrece (`WORLD.OPTION_WITHOUT_TRIGGER`: una opción que ningún diálogo ni objeto ofrece no se puede
 * elegir), la descripción del caso (OCL-07), un mapa por escena, una salida segura y la lista de publicación al 100 %.
 * Sin errores de validación (y dos avisos de plantilla: no alcanza dos finales con una sola decisión). Lo comparten las pruebas que necesitan un caso publicable (`createPublishedCase`
 * y la revisión del caso).
 */
export async function buildPublishableDraft(
  request: APIRequestContext, token: string, options: DraftOptions,
): Promise<{ id: number; title: string }> {
  const base = '/api/authoring/cases';
  const created = await send(request, token, 'post', base,
    { title: options.title, description: options.description ?? DEFAULT_DESCRIPTION }, 'crear el caso');
  const id: number = created['caseVersionId'];
  const startId: number = created['nodes'][0]['id'];
  const withClosing = await send(request, token, 'post', `${base}/${id}/nodes`, {
    ...NODE_BODY, nodeKey: 'cierre', title: 'Cierre del caso', narrative: 'Fin.', terminal: true,
    sensitiveContent: !!options.sensitive, warningMessage: options.sensitive ? 'Esta escena trata una situación delicada.' : null,
    safeExitRequired: !!options.sensitive, supportResources: [SUPPORT_RESOURCE],
  }, 'escena final');
  const closingId: number = withClosing['nodes'].find((node: Json) => node['key'] === 'cierre')['id'];
  await send(request, token, 'post', `${base}/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: closingId, optionKey: 'cerrar', text: 'Cerrar el caso', responseClass: 'RECOMMENDED',
    prohibitedConduct: false, prohibitionReason: null,
    immediateFeedback: 'Cerrar el caso es adecuado en este ejemplo.',
  }, 'decisión');
  const withOptions = await send(request, token, 'post', `${base}/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: closingId, optionKey: 'postergar', text: 'Dejar el caso para después', responseClass: 'RISKY',
    prohibitedConduct: false, prohibitionReason: null,
    immediateFeedback: 'Postergar el cierre deja el caso abierto sin necesidad.',
  }, 'segunda opción de la decisión');
  const optionIds: number[] = withOptions['decisions'].map((decision: Json) => decision['id']);
  // La escena de inicio ya trae su mapa («escena-inicial»: un mapa por escena); solo falta el de la escena final.
  await send(request, token, 'post', `${base}/${id}/maps`, {
    nodeId: closingId, mapKey: 'sala-cierre', title: 'Sala de cierre', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430,
  }, 'mapa de la escena final');
  const view = await readEditor(request, token, id);
  const startMapId: number = view['maps'][0]['id'];
  for (const [index, optionId] of optionIds.entries()) {
    await send(request, token, 'post', `${base}/${id}/maps/${startMapId}/objects`, {
      objectKey: `opcion-${index + 1}`, label: `Opción ${index + 1}`, objectType: 'OBJECT', x: 200 + 100 * index, y: 300, width: 48, height: 48,
      colorHex: '#4FA3A5', icon: 'touch_app', shortCode: `O${index + 1}`, collision: false, visible: true, interactionPrompt: 'Elegir',
      interactionText: '', decisionOptionId: optionId, toolCode: null,
    }, 'objeto que ofrece la opción');
  }
  await send(request, token, 'post', `${base}/${id}/maps/${startMapId}/objects`, {
    objectKey: 'salida', label: 'Salida segura', objectType: 'EXIT', x: 800, y: 300, width: 48, height: 48, colorHex: '#4FA3A5',
    icon: 'exit_to_app', shortCode: 'SAL', collision: false, visible: true, interactionPrompt: 'Salir', interactionText: '',
    decisionOptionId: null, toolCode: null,
  }, 'salida segura');
  await send(request, token, 'put', `${base}/${id}/checklist`, {
    contentOriginal: true, ethicsReviewed: true, safetyProtocols: true, noStigmatizing: true, triggerWarnings: true, accessibilityOk: true,
    scopeEducational: true,
  }, 'lista de publicación');
  return { id, title: created['title'] };
}

/** Crea el caso publicable (`buildPublishableDraft`), le pone la ficha y los personajes, lo envía a revisión y lo aprueba. */
export async function createPublishedCase(request: APIRequestContext, options: CaseFixtureOptions): Promise<CaseFixture> {
  const admin = await apiToken(request, ADMIN);
  const base = '/api/authoring/cases';
  const draft = await buildPublishableDraft(request, admin, {
    title: options.title, description: options.context, sensitive: options.sensitive,
  });
  const id = draft.id;
  if (options.context !== undefined || options.learningObjectives) {
    await send(request, admin, 'put', `${base}/${id}/brief`, {
      context: options.context ?? '', learningObjectives: options.learningObjectives ?? [],
    }, 'ficha del caso');
  }
  for (const [index, character] of (options.characters ?? []).entries()) {
    await send(request, admin, 'post', `${base}/${id}/characters`, { ...character, showInBrief: true, displayOrder: index }, `personaje ${character.displayName}`);
  }
  await send(request, admin, 'post', `${base}/${id}/lifecycle`, { action: 'submit' }, 'enviar a revisión');
  await send(request, admin, 'post', `${base}/${id}/lifecycle`, { action: 'approve', note: 'Caso de prueba e2e.', contentReview: contentReviewProof() }, 'aprobar y publicar');
  return { caseVersionId: id, title: draft.title };
}

export interface ExplorationCaseOptions {
  /**
   * La escena inicial no cierra el caso: las dos opciones llevan a una escena de seguimiento (con sus dos opciones hacia el
   * cierre). Así la reacción de Laura ocurre en una decisión que NO es la última y «Salida segura» abre la pausa de verdad
   * (en la última decisión corta la reacción y abre el resultado).
   */
  followUp?: boolean;
}

/**
 * Un caso de exploración (bloque B, Tarea 16): la escena inicial tiene objetivo («Escuchar a Laura») y su sala trae a
 * Laura (PERSON, persona clave), una carpeta revisable sin opción y un archivo que ofrece `postergar`. La opción
 * `escuchar` (Recomendada) exige haber revisado la carpeta y trae la reacción de Laura; `postergar` (Con riesgo) no pide
 * nada. Laura y el archivo ofrecen su opción por un diálogo autorado (el servidor no arma una conversación para un objeto
 * que solo apunta a una opción). Cumple OCL-09 a OCL-12: hay una opción sin requisito, la carpeta es visible en la sala y
 * la PERSON ofrece la opción que reacciona. Molde: `buildPublishableDraft`.
 */
export async function buildExplorationDraft(
  request: APIRequestContext, token: string, title: string, options: ExplorationCaseOptions = {},
): Promise<{ id: number; title: string }> {
  const base = '/api/authoring/cases';
  const created = await send(request, token, 'post', base,
    { title, description: 'Caso de prueba de exploración: una carpeta que abre otra forma de responder.' }, 'crear el caso');
  const id: number = created['caseVersionId'];
  const start = created['nodes'][0] as Json;
  const startId: number = start['id'];
  const withClosing = await send(request, token, 'post', `${base}/${id}/nodes`, {
    ...NODE_BODY, nodeKey: 'cierre', title: 'Cierre del caso', narrative: 'Fin.', terminal: true, supportResources: [SUPPORT_RESOURCE],
  }, 'escena final');
  const closingId: number = withClosing['nodes'].find((node: Json) => node['key'] === 'cierre')['id'];
  let middleId = closingId;
  if (options.followUp) {
    const withFollowUp = await send(request, token, 'post', `${base}/${id}/nodes`, {
      ...NODE_BODY, nodeKey: 'seguimiento', title: 'Seguimiento', narrative: 'Unos días después.',
    }, 'escena de seguimiento');
    middleId = withFollowUp['nodes'].find((node: Json) => node['key'] === 'seguimiento')['id'];
  }
  // El objetivo de la escena inicial (§5 del contrato: `goal`); lo demás se manda como estaba.
  await send(request, token, 'put', `${base}/${id}/nodes/${startId}`, {
    nodeKey: start['key'], title: start['title'], narrative: start['narrative'], supportResources: start['supportResources'] ?? [],
    requiredTools: start['requiredTools'] ?? [], sensitiveContent: start['sensitiveContent'] ?? false,
    safeExitRequired: start['safeExitRequired'] ?? false, warningMessage: start['warningMessage'] ?? null,
    terminal: start['terminal'] ?? false, startNode: start['startNode'] ?? true, positionX: start['positionX'], positionY: start['positionY'],
    goal: 'Escuchar a Laura',
  }, 'objetivo de la escena inicial');
  await send(request, token, 'post', `${base}/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: middleId, optionKey: 'escuchar', text: 'Escuchar a Laura sin interrumpirla',
    responseClass: 'RECOMMENDED', prohibitedConduct: false, prohibitionReason: null,
    immediateFeedback: 'Escuchar sin interrumpir le da espacio a Laura.',
    requires: { inspected: 'carpeta' },
    reaction: { linea: 'Gracias por escucharme.', emocion: 'triste', gesto: 'se-acerca' },
  }, 'opción escuchar');
  const withOptions = await send(request, token, 'post', `${base}/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: middleId, optionKey: 'postergar', text: 'Dejar la conversación para después',
    responseClass: 'RISKY', prohibitedConduct: false, prohibitionReason: null,
    immediateFeedback: 'Postergar la conversación deja a Laura sin respuesta.',
  }, 'opción postergar');
  const optionId = (key: string): number =>
    withOptions['decisions'].find((decision: Json) => decision['optionKey'] === key || decision['key'] === key)['id'];
  await send(request, token, 'post', `${base}/${id}/maps`, {
    nodeId: closingId, mapKey: 'sala-cierre', title: 'Sala de cierre', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430,
  }, 'mapa de la escena final');
  const objectBase = {
    width: 48, height: 48, colorHex: '#4FA3A5', icon: 'touch_app', collision: false, visible: true, toolCode: null, metadata: {},
  };
  const roomDialogue = (key: string, speaker: string, line: string, choice: Json, objectKey: string) => ({
    key, mapObjectKey: objectKey, speakerName: speaker, portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: speaker, text: line, emotion: 'neutral' }],
    choices: [{ ...choice, requiredToolCode: null, effect: {}, displayOrder: 1 }],
  });
  await send(request, token, 'put', `${base}/${id}/world?nodeId=${startId}`, {
    objects: [
      { ...objectBase, key: 'carpeta', label: 'Historia clínica', type: 'OBJECT', x: 260, y: 300, shortCode: 'HC',
        interactionPrompt: 'Revisar', interactionText: 'La carpeta resume lo que se sabe de Laura.', decisionOptionId: null },
      { ...objectBase, key: 'laura', label: 'Laura', type: 'PERSON', x: 480, y: 300, shortCode: 'LAU', icon: 'psychology',
        interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: optionId('escuchar'), metadata: { personaClave: true } },
      { ...objectBase, key: 'archivo', label: 'Archivo de pendientes', type: 'OBJECT', x: 700, y: 300, shortCode: 'ARC',
        interactionPrompt: 'Abrir', interactionText: '', decisionOptionId: optionId('postergar') },
      { ...objectBase, key: 'salida', label: 'Salida segura', type: 'EXIT', x: 800, y: 440, shortCode: 'SAL', icon: 'exit_to_app',
        interactionPrompt: 'Salir', interactionText: '', decisionOptionId: null },
    ],
    dialogues: [
      roomDialogue('laura-habla', 'Laura', 'Laura te mira en silencio.',
        { key: 'escuchar', text: 'Escuchar a Laura sin interrumpirla', decisionOptionId: optionId('escuchar') }, 'laura'),
      roomDialogue('archivo-abre', 'Archivo', 'Hay una lista de asuntos pendientes.',
        { key: 'postergar', text: 'Dejar la conversación para después', decisionOptionId: optionId('postergar') }, 'archivo'),
    ],
  }, 'sala de la escena inicial');
  if (options.followUp) {
    await send(request, token, 'post', `${base}/${id}/maps`, {
      nodeId: middleId, mapKey: 'sala-seguimiento', title: 'Sala de seguimiento', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430,
    }, 'mapa de la escena de seguimiento');
    const followUpIds: number[] = [];
    for (const [optionKey, text, responseClass] of [['seguir', 'Acompañar el seguimiento', 'RECOMMENDED'], ['soltar', 'Soltar el seguimiento', 'RISKY']] as const) {
      const view = await send(request, token, 'post', `${base}/${id}/decisions`, {
        sourceNodeId: middleId, targetNodeId: closingId, optionKey, text, responseClass,
        prohibitedConduct: false, prohibitionReason: null, immediateFeedback: `${text}: así queda registrado en este ejemplo.`,
      }, `opción ${optionKey}`);
      followUpIds.push(view['decisions'].find((decision: Json) => decision['optionKey'] === optionKey || decision['key'] === optionKey)['id']);
    }
    const followUpMap = (await readEditor(request, token, id))['maps'].find((map: Json) => map['nodeId'] === middleId);
    for (const [index, optionId] of followUpIds.entries()) {
      await send(request, token, 'post', `${base}/${id}/maps/${followUpMap['id']}/objects`, {
        objectKey: `seguimiento-${index + 1}`, label: `Seguimiento ${index + 1}`, objectType: 'OBJECT', x: 200 + 100 * index, y: 300, width: 48, height: 48,
        colorHex: '#4FA3A5', icon: 'touch_app', shortCode: `S${index + 1}`, collision: false, visible: true, interactionPrompt: 'Elegir',
        interactionText: '', decisionOptionId: optionId, toolCode: null,
      }, 'objeto que ofrece la opción de seguimiento');
    }
  }
  await readEditor(request, token, id);
  await send(request, token, 'put', `${base}/${id}/checklist`, {
    contentOriginal: true, ethicsReviewed: true, safetyProtocols: true, noStigmatizing: true, triggerWarnings: true, accessibilityOk: true,
    scopeEducational: true,
  }, 'lista de publicación');
  return { id, title: created['title'] };
}

/** Crea el caso de exploración (`buildExplorationDraft`), lo envía a revisión y lo publica. */
export async function createExplorationCase(request: APIRequestContext, options: ExplorationCaseOptions = {}): Promise<CaseFixture> {
  const admin = await apiToken(request, ADMIN);
  const base = '/api/authoring/cases';
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
  const draft = await buildExplorationDraft(request, admin, `Exploración e2e ${stamp}`, options);
  await send(request, admin, 'post', `${base}/${draft.id}/lifecycle`, { action: 'submit' }, 'enviar a revisión');
  await send(request, admin, 'post', `${base}/${draft.id}/lifecycle`, { action: 'approve', note: 'Caso de prueba e2e.', contentReview: contentReviewProof() }, 'aprobar y publicar');
  return { caseVersionId: draft.id, title: draft.title };
}

/**
 * Clona una versión publicada a un BORRADOR (sin publicarlo) y lee su editor: el arranque de `cloneAndPublishCase`. Devuelve
 * el id del borrador y sus escenas, para ensayarlo (`/portal/casos/<id>/ensayo`) o editarlo por la API.
 */
export async function cloneDraft(
  request: APIRequestContext, source: number,
): Promise<{ id: number; nodes: { id: number; key: string; title: string }[] }> {
  const admin = await apiToken(request, ADMIN);
  const cloned = await send(request, admin, 'post', `/api/authoring/cases/${source}/clone-version`, {}, 'clonar la versión');
  const id: number = cloned['caseVersionId'];
  const view = await readEditor(request, admin, id);
  return { id, nodes: (view['nodes'] as Json[]).map(n => ({ id: n['id'], key: n['key'], title: n['title'] })) };
}

/**
 * Clona una versión publicada (p. ej. la del caso demo, que se puede jugar de verdad), le pone las mismas pistas en TODAS
 * sus escenas y la publica. Sirve para probar la interfaz sobre un mundo completo con datos que la semilla no trae.
 */
export async function cloneAndPublishCase(
  request: APIRequestContext, sourceCaseVersionId: number, options: { hints?: string[] } = {},
): Promise<CaseFixture> {
  const admin = await apiToken(request, ADMIN);
  const base = '/api/authoring/cases';
  const cloned = await send(request, admin, 'post', `${base}/${sourceCaseVersionId}/clone-version`, {}, 'clonar la versión');
  const id: number = cloned['caseVersionId'];
  const view = await readEditor(request, admin, id);
  for (const map of view['maps'] as Json[]) {
    for (const [index, text] of (options.hints ?? []).entries()) {
      await send(request, admin, 'post', `${base}/${id}/maps/${map['id']}/hints`, { text, hintOrder: index + 1 }, `pista ${index + 1} de ${map['title']}`);
    }
  }
  // El caso demo no trae recursos de apoyo y la lista marca «protocolos de seguridad» (S3-3): la primera escena lleva uno de prueba.
  const scene = (view['nodes'] as Json[])[0];
  await send(request, admin, 'put', `${base}/${id}/nodes/${scene['id']}`, {
    nodeKey: scene['key'], title: scene['title'], narrative: scene['narrative'], supportResources: [SUPPORT_RESOURCE],
    requiredTools: scene['requiredTools'], sensitiveContent: scene['sensitiveContent'],
    safeExitRequired: scene['safeExitRequired'], warningMessage: scene['warningMessage'], terminal: scene['terminal'],
    startNode: scene['startNode'], positionX: scene['positionX'], positionY: scene['positionY'],
  }, 'recurso de apoyo de la primera escena');
  await send(request, admin, 'put', `${base}/${id}/checklist`, {
    contentOriginal: true, ethicsReviewed: true, safetyProtocols: true, noStigmatizing: true, triggerWarnings: true,
    accessibilityOk: true, scopeEducational: true,
  }, 'lista de publicación');
  await send(request, admin, 'post', `${base}/${id}/lifecycle`, { action: 'submit' }, 'enviar a revisión');
  await send(request, admin, 'post', `${base}/${id}/lifecycle`, { action: 'approve', note: 'Caso de prueba e2e.', contentReview: contentReviewProof() }, 'aprobar y publicar');
  return { caseVersionId: id, title: view['title'] };
}

/** El grupo de la docente de la semilla al que pertenece el estudiante de la semilla. */
export async function seededGroupId(request: APIRequestContext): Promise<number> {
  const professor = await apiToken(request, PROFESOR);
  const groups = ((await (await request.get('/api/grupos', { headers: bearer(professor) })).json()).data ?? []) as Array<{ id: number }>;
  for (const group of groups) {
    const rows = ((await (await request.get(`/api/grupos/${group.id}/estudiantes`, { headers: bearer(professor) })).json()).data ?? []) as Array<{ email: string; membershipStatus?: string }>;
    if (rows.some(row => row.email === ESTUDIANTE.email && (row.membershipStatus === undefined || row.membershipStatus === 'ACTIVE'))) return group.id;
  }
  throw new Error(`Ningún grupo de ${PROFESOR.email} tiene a ${ESTUDIANTE.email}`);
}

/** El grupo de la docente al que pertenece el estudiante de la semilla, con el nombre y el código que se ven en pantalla. */
export async function seededGroup(request: APIRequestContext): Promise<{ id: number; nombre: string; codigo: string }> {
  const id = await seededGroupId(request);
  const professor = await apiToken(request, PROFESOR);
  const groups = ((await (await request.get('/api/grupos', { headers: bearer(professor) })).json()).data ?? []) as Array<{ id: number; nombre: string; codigo: string }>;
  const group = groups.find(item => item.id === id);
  if (!group) throw new Error(`El grupo ${id} no está en la lista de ${PROFESOR.email}`);
  return group;
}

/** La asignación creada y las que se movieron para que quedara primera (con el orden que tenían). */
export interface AssignmentRecord { id: number; shifted: Array<{ id: number; sortOrder: number }> }

/** La docente asigna la versión publicada a un grupo (C7); las asignaciones activas con el mismo orden o uno anterior pasan detrás. */
export async function assignCase(request: APIRequestContext, caseVersionId: number, window: AssignmentWindow = {}): Promise<AssignmentRecord> {
  const professor = await apiToken(request, PROFESOR);
  const groupId = window.groupId ?? await seededGroupId(request);
  const sortOrder = window.sortOrder ?? 0;
  const body: Json = { caseVersionId, target: { type: 'GROUP', groupId }, sortOrder };
  if (window.opensAt !== undefined) body['opensAt'] = window.opensAt;
  if (window.closesAt !== undefined) body['closesAt'] = window.closesAt;
  const created = await send(request, professor, 'post', '/api/assignments', body, 'asignar el caso');
  const others = ((await (await request.get(`/api/assignments?groupId=${groupId}`, { headers: bearer(professor) })).json()).data ?? []) as
    Array<{ id: number; sortOrder: number; active: boolean }>;
  const shifted: AssignmentRecord['shifted'] = [];
  for (const row of others) {
    if (row.id === created['id'] || !row.active || row.sortOrder > sortOrder) continue;
    await send(request, professor, 'patch', `/api/assignments/${row.id}`, { sortOrder: sortOrder + 1 }, 'mover la asignación vecina');
    shifted.push({ id: row.id, sortOrder: row.sortOrder });
  }
  return { id: created['id'], shifted };
}

/** Deja el caso fuera del catálogo de todos: apaga sus asignaciones, devuelve el orden anterior a las vecinas y archiva la versión. La limpieza nunca tapa el resultado de la prueba. */
export async function retireCase(request: APIRequestContext, caseVersionId: number, records: AssignmentRecord[] = []): Promise<void> {
  try {
    const professor = await apiToken(request, PROFESOR);
    // Las asignaciones que la prueba creó por la interfaz (y no están en `records`) también se apagan.
    const created = ((await (await request.get(`/api/assignments?caseVersionId=${caseVersionId}`, { headers: bearer(professor) })).json()).data ?? []) as Array<{ id: number }>;
    for (const assignment of created) {
      await request.patch(`/api/assignments/${assignment.id}`, { headers: bearer(professor), data: { active: false } });
    }
    for (const record of records) {
      await request.patch(`/api/assignments/${record.id}`, { headers: bearer(professor), data: { active: false } });
      for (const moved of record.shifted) {
        await request.patch(`/api/assignments/${moved.id}`, { headers: bearer(professor), data: { sortOrder: moved.sortOrder } });
      }
    }
    const admin = await apiToken(request, ADMIN);
    await transition(request, admin, caseVersionId, { action: 'archive', scope: 'version' });
  } catch (error) {
    // La limpieza no debe tapar el resultado de la prueba, pero un fallo aquí deja la asignación activa y el caso de la
    // semilla bloqueado por la secuencia para las pruebas siguientes: que se vea de dónde viene.
    console.warn(`retireCase(${caseVersionId}) no terminó: ${String(error)}`);
  }
}
