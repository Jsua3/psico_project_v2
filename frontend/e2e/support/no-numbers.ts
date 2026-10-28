import type { Page, Response } from '@playwright/test';

/**
 * «Ninguna cifra al estudiante» vista desde el navegador (modelo de métricas, Tarea 22).
 *
 * Espejo de `backend_django/apps/simulation/tests/test_no_numbers_to_student.py` (Tarea 17): se recoge el cuerpo JSON
 * de cada respuesta de `/api/simulation/**` que recibe el navegador mientras el estudiante juega, y se recorre entero.
 * Falla si aparece, en cualquier nivel, una clave del modelo numérico viejo, o si un número (no booleano) cuelga de una
 * clave que no sea de la lista blanca: identificadores, contadores de HECHOS, duraciones y geometría. Un conteo de
 * hechos («Reconsideraste 2 respuestas») no es una medida.
 *
 * Además, `measuresInText` revisa lo que el estudiante LEE: ningún porcentaje, «puntaje», «estrés», «ranking» ni
 * «desempeño», y ningún «8/10» ni «40 pts».
 */

/** Claves que no pueden aparecer en ningún nivel de ninguna respuesta: son el modelo numérico viejo. */
export const RETIRED_KEYS: ReadonlySet<string> = new Set([
  'accumulatedScore', 'stressIndex', 'metrics', 'clinicalState', 'scoreDelta', 'stressDelta', 'finalScore',
  'finalStress', 'adequateDecisions', 'riskyDecisions', 'inadequateDecisions', 'prohibitedDecisions',
  // Los deltas y las medidas de la métrica vieja (`metrics`/`effects` de las decisiones y del mundo).
  'trustDelta', 'victimRiskDelta', 'victimRisk', 'userTrust', 'sceneStress', 'professionalScore', 'revictimizationRisk',
  // El final del motor viejo: las métricas, las banderas y los conteos por severidad del caso.
  'caseMetrics', 'caseFlags', 'severityCounts',
]);

/** Claves cuyo valor PUEDE ser un número, cada una con su razón. Todo lo demás que sea numérico es una medida. */
export const ALLOWED_NUMERIC_KEYS: Readonly<Record<string, string>> = {
  id: 'identificador de una fila',
  ordinal: 'número de intento del estudiante en ese caso (1.º, 2.º…): un ordinal, no una medida',
  schemaVersion: 'versión del formato del reporte congelado',
  displayOrder: 'posición de la escena u opción en la presentación',
  order: 'posición en la lista (revisión de decisiones, pistas)',
  retries: 'cuántas veces reconsideró una respuesta antes de decidir',
  prohibitedRetries: 'cuántas veces reconsideró una respuesta contraindicada (hecho, sin evaluarlo)',
  reflections: 'cuántas reflexiones escribió (hecho del recorrido)',
  reflectionsCount: 'cuántas reflexiones escribió (hecho del reporte)',
  toolsUsed: 'cuántas herramientas usó',
  available: 'cuántas pistas trae la escena (hecho de la escena, no de la persona)',
  decisionScenes: 'cuántas escenas de decisión tiene el caso (estructura del caso)',
  nodeCount: 'cuántas escenas tiene el caso (estructura del caso)',
  recommended: 'cuántas respuestas hubo de cada clase: hecho, no puntaje (`counts` del reporte v3)',
  acceptable: 'ídem: respuestas Aceptables registradas',
  risky: 'ídem: respuestas Con riesgo registradas',
  contraindicated: 'ídem: respuestas Contraindicadas registradas',
  nonRecommendedCount: 'cuántas respuestas no fueron Recomendadas: conteo de hechos',
  rating: 'eco de la propia respuesta del estudiante en la encuesta de cierre, no una medida de él',
  seconds: 'una duración',
  x: 'posición', y: 'posición', width: 'geometría del mapa', height: 'geometría del mapa',
  spawnX: 'punto de aparición del mapa', spawnY: 'punto de aparición del mapa',
  entryX: 'punto de entrada de la puerta', entryY: 'punto de entrada de la puerta',
  interactionRadius: 'radio de interacción de un objeto',
  cameraZoom: 'acercamiento de la cámara en la sala (`ambient` de autoría): geometría del render, no una medida',
  cuadros: 'cuadros de la hoja de animación de cercanía de un objeto (`metadata.animacionCerca`): parámetro del dibujo, no una medida',
  fps: 'cuadros por segundo de esa animación: parámetro del dibujo, no una medida',
};

/** Sufijos con una sola razón cada uno: `*Id` (identificador) y `*Seconds` (duración). */
export const ALLOWED_SUFFIXES: readonly string[] = ['Id', 'Seconds'];

export interface RecordedResponse {
  /** `GET /api/simulation/attempts/…`: método y ruta, sin la cadena de consulta. */
  where: string;
  status: number;
  body: unknown;
}

export interface Measure {
  where: string;
  key: string | null;
  value: number;
}

export interface RetiredKeyHit {
  where: string;
  key: string;
}

function isAllowedNumericKey(key: string | null): boolean {
  if (key === null) return false;
  return key in ALLOWED_NUMERIC_KEYS || ALLOWED_SUFFIXES.some(suffix => key.endsWith(suffix));
}

function walk(value: unknown, where: string, key: string | null, numbers: Measure[], keys: RetiredKeyHit[]): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, where, key, numbers, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      keys.push({ where, key: childKey });
      walk(child, where, childKey, numbers, keys);
    }
  } else if (typeof value === 'number') {
    numbers.push({ where, key, value });
  }
}

function scan(records: readonly RecordedResponse[]): { numbers: Measure[]; keys: RetiredKeyHit[] } {
  const numbers: Measure[] = [];
  const keys: RetiredKeyHit[] = [];
  for (const record of records) walk(record.body, record.where, null, numbers, keys);
  return { numbers, keys };
}

/** Las claves retiradas del modelo viejo que aparecen en alguna respuesta (sin repetidos). */
export function retiredKeysIn(records: readonly RecordedResponse[]): RetiredKeyHit[] {
  const seen = new Set<string>();
  const found: RetiredKeyHit[] = [];
  for (const hit of scan(records).keys) {
    if (!RETIRED_KEYS.has(hit.key)) continue;
    const id = `${hit.where}|${hit.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    found.push(hit);
  }
  return found;
}

/** Los números que cuelgan de una clave que no es id, hecho, duración ni posición: medidas (sin repetidos). */
export function measuresIn(records: readonly RecordedResponse[]): Measure[] {
  const seen = new Set<string>();
  const found: Measure[] = [];
  for (const number of scan(records).numbers) {
    if (isAllowedNumericKey(number.key)) continue;
    const id = `${number.where}|${number.key}|${number.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    found.push(number);
  }
  return found;
}

/** Cadena legible de `where` con los ids sustituidos, para que el informe de un fallo no cambie en cada corrida. */
export function shapeOf(where: string): string {
  return where
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}')
    .replace(/\/cases\/\d+\//g, '/cases/{n}/');
}

/**
 * Cada patrón que un estudiante no debe leer: un porcentaje, las palabras del marcador del juego viejo y un
 * «8/10» o «40 pts». Los números sueltos (un año, el artículo de una ley, «Decisión 2 de 6») no son medidas.
 */
const MEASURE_IN_TEXT: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'porcentaje', pattern: /%/ },
  { name: 'puntaje', pattern: /puntaje|puntos?\b|\bscore\b/i },
  { name: 'estrés', pattern: /estr[eé]s/i },
  { name: 'ranking', pattern: /ranking|clasificaci[oó]n general/i },
  { name: 'desempeño', pattern: /desempe[nñ]o/i },
  { name: 'fracción de nota', pattern: /\b\d+(?:[.,]\d+)?\s*\/\s*\d+\b/ },
  { name: 'puntos abreviados', pattern: /\b\d+(?:[.,]\d+)?\s*pts?\b/i },
];

/** Lo que de `text` es una medida (vacío si el texto está limpio). */
export function measuresInText(text: string): string[] {
  const hits: string[] = [];
  for (const { name, pattern } of MEASURE_IN_TEXT) {
    const match = pattern.exec(text);
    if (match) hits.push(`${name}: «${match[0]}»`);
  }
  return hits;
}

/** Los cuatro códigos de clase de respuesta: el estudiante no debe verlos antes de decidir. */
const CLASS_CODES: ReadonlySet<string> = new Set(['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED']);

function classValues(value: unknown, where: string, found: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) classValues(child, where, found);
  } else if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) classValues(child, where, found);
  } else if (typeof value === 'string' && CLASS_CODES.has(value)) {
    found.push(`${where} → ${value}`);
  }
}

/** Dónde aparece un código de clase como valor (sin repetidos): antes de decidir no debe aparecer en ninguna respuesta. */
export function classValuesIn(records: readonly RecordedResponse[]): string[] {
  const found: string[] = [];
  for (const record of records) classValues(record.body, record.where, found);
  return [...new Set(found)];
}

/**
 * Lo que solo se revela al cerrar (§3.2 M1/M2): la clase de cada respuesta (`class`, `responseClass`), los conteos por
 * clase (`counts`), el final (`ending`) y los hitos (`milestones`).
 */
const CLOSE_ONLY_KEYS: ReadonlySet<string> = new Set(['class', 'responseClass', 'counts', 'ending', 'milestones']);

/** El estado crudo del caso que el servidor guarda en `flags` del mundo y que no debe salir hasta cerrar. */
const RAW_CASE_STATE_IN_FLAGS: ReadonlySet<string> = new Set(['milestones', 'persona']);

function closeOnlyKeys(value: unknown, where: string, parentKey: string | null, found: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) closeOnlyKeys(child, where, parentKey, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (CLOSE_ONLY_KEYS.has(key)) found.push(`${where} → ${key}`);
      // `persona` en palabras SÍ viaja a nivel del estado del intento (el HUD la expresa por diseño): solo importa
      // la persona CRUDA dentro de `flags` del mundo.
      if (parentKey === 'flags' && RAW_CASE_STATE_IN_FLAGS.has(key)) found.push(`${where} → flags.${key}`);
      closeOnlyKeys(child, where, key, found);
    }
  }
}

/**
 * Las claves que solo se revelan al cerrar, y el estado crudo del caso dentro de `flags`, que aparecen en alguna
 * respuesta (sin repetidos). Se llama ANTES de la última decisión: debe estar vacío.
 */
export function closeOnlyKeysIn(records: readonly RecordedResponse[]): string[] {
  const found: string[] = [];
  for (const record of records) closeOnlyKeys(record.body, record.where, null, found);
  return [...new Set(found)];
}

export interface SimulationRecorder {
  /** Lo recogido hasta ahora. */
  readonly records: readonly RecordedResponse[];
  /** Espera a que termine de leerse el cuerpo de las respuestas que ya llegaron. */
  settled(): Promise<void>;
  stop(): void;
}

/**
 * Empieza a recoger el cuerpo JSON de cada respuesta de `/api/simulation/**` de la página. Una respuesta cuyo cuerpo ya
 * no se puede leer (la página navegó) se ignora: no hay nada que revisar en ella.
 */
export function recordSimulationResponses(page: Page): SimulationRecorder {
  const records: RecordedResponse[] = [];
  const pending = new Set<Promise<void>>();
  const onResponse = (response: Response): void => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/simulation')) return;
    if (!(response.headers()['content-type'] ?? '').startsWith('application/json')) return;
    const where = `${response.request().method()} ${url.pathname}`;
    const status = response.status();
    const task: Promise<void> = response.json().then(
      body => { records.push({ where, status, body }); },
      () => undefined,
    ).finally(() => { pending.delete(task); });
    pending.add(task);
  };
  page.on('response', onResponse);
  return {
    get records() { return records; },
    settled: async () => { await Promise.all([...pending]); },
    stop() { page.off('response', onResponse); },
  };
}
