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
  const args = { students: 40, minutes: 5, server: 'runserver', out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--students') args.students = Number(value);
    else if (flag === '--minutes') args.minutes = Number(value);
    else if (flag === '--server') args.server = value;
    else if (flag === '--out') args.out = value;
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
  return args;
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
