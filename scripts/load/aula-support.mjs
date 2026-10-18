/** Piezas puras del guion de carga de un aula (E0-2). */

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function summarize(samples) {
  const byOp = {};
  for (const sample of samples) (byOp[sample.op] ??= []).push(sample);
  const out = {};
  for (const [op, items] of Object.entries(byOp)) {
    const times = items.map((s) => s.ms);
    out[op] = {
      count: items.length,
      errors: items.filter((s) => !s.ok).length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
    };
  }
  return out;
}

export function parseAulaArgs(argv) {
  const args = {
    students: 40,
    minutes: 5,
    server: 'runserver',
    out: null,
    p95MaxMs: null,
    errorRateMax: null,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--students') args.students = Number(value);
    else if (flag === '--minutes') args.minutes = Number(value);
    else if (flag === '--server') args.server = value;
    else if (flag === '--out') args.out = value;
    else if (flag === '--p95-max-ms') args.p95MaxMs = Number(value);
    else if (flag === '--error-rate-max') args.errorRateMax = Number(value);
    else throw new Error(`Argumento desconocido: ${flag}`);
  }
  if (!Number.isInteger(args.students) || args.students < 1 || args.students > 500) {
    throw new Error('--students debe ser un entero entre 1 y 500.');
  }
  if (!(args.minutes > 0 && args.minutes <= 120)) {
    throw new Error('--minutes debe estar entre 0 y 120.');
  }
  if (!['runserver', 'gunicorn'].includes(args.server)) {
    throw new Error('--server debe ser runserver o gunicorn.');
  }
  if (args.p95MaxMs !== null && !(args.p95MaxMs > 0)) {
    throw new Error('--p95-max-ms debe ser un número positivo.');
  }
  if (args.errorRateMax !== null && !(args.errorRateMax >= 0 && args.errorRateMax <= 1)) {
    throw new Error('--error-rate-max debe estar entre 0 y 1.');
  }
  return args;
}

export function checkLoadThresholds(byOperation, { p95MaxMs = null, errorRateMax = null } = {}) {
  const violations = [];
  let totalCount = 0;
  let totalErrors = 0;
  for (const [op, metrics] of Object.entries(byOperation)) {
    totalCount += metrics.count ?? 0;
    totalErrors += metrics.errors ?? 0;
    if (p95MaxMs !== null && metrics.p95 !== null && metrics.p95 > p95MaxMs) {
      violations.push(`${op}: p95=${Math.round(metrics.p95)} ms supera el máximo ${p95MaxMs} ms`);
    }
  }
  if ((p95MaxMs !== null || errorRateMax !== null) && totalCount === 0) {
    // Un guion que no llegó a medir nada (servidor caído, sin estudiantes) no «cumple»: no hay con qué comparar.
    violations.push('la corrida no registró ninguna muestra: sin mediciones no hay umbral que cumplir');
  }
  if (errorRateMax !== null && totalCount > 0) {
    const errorRate = totalErrors / totalCount;
    if (errorRate > errorRateMax) {
      violations.push(
        `tasa de error ${(errorRate * 100).toFixed(2)}% (${totalErrors}/${totalCount}) supera ${(errorRateMax * 100).toFixed(2)}%`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}

// Rutas plausibles en hospital-urgencias (spawn 480,430), las mismas que usan las
// pruebas de contrato del backend (test_world.py): el servidor valida desplazamiento.
const PATH_TO_FAMILIA = [[340, 430], [250, 430]];
const PATH_TO_DOOR = [[430, 435], [610, 440], [790, 445]];

/**
 * Guion de un estudiante virtual: la sesión típica del aula, en el orden en que la
 * hace el cliente real. `moveIntervalMs` es el debounce del cliente (550 ms) con un
 * pequeño margen; `decisionEveryMs` es el ritmo de decisión de un recorrido atento.
 */
export function planStudentSession() {
  return {
    moveIntervalMs: 600,
    decisionEveryMs: 45000,
    steps: [
      { op: 'login' },
      { op: 'intento' },
      { op: 'mundo' },
      ...PATH_TO_FAMILIA.map(([x, y]) => ({ op: 'posicion', x, y })),
      { op: 'inspeccion', key: 'familia-crisis' },
      ...PATH_TO_DOOR.map(([x, y]) => ({ op: 'posicion', x, y })),
      {
        op: 'puerta',
        targetNodeKey: 'hospital-sala-escucha',
        entryX: 160,
        entryY: 452,
        doorKey: 'puerta-sala-escucha',
      },
      { op: 'decidir' },
    ],
  };
}
