import { join, resolve } from 'node:path';

function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseMeasureArgs(argv, { root, today = new Date() } = {}) {
  let outDir = join(root, '.superpowers', 'baseline-backend', localDate(today));
  let label = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      i += 1;
      outDir = resolve(argv[i]);
    } else if (arg === '--label') {
      i += 1;
      label = String(argv[i] ?? '');
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  return { outDir, label };
}

export function renderReport({ endpoints, environment, git, date, label }) {
  const rows = Object.entries(endpoints)
    .sort(([, a], [, b]) => b.queries - a.queries)
    .map(([name, m]) => {
      const verdict = m.queries <= m.budget ? 'OK' : 'EXCEDE';
      return `| ${name} | ${m.queries} | ${m.writes} | ${m.bytes} | ${m.ms_median} | ${m.budget} | ${verdict} |`;
    });
  return [
    `# Línea base del backend — ${date}${label ? ` (${label})` : ''}`,
    '',
    `Commit \`${git}\` · PostgreSQL ${environment.postgres} · Python ${environment.python} · Django ${environment.django}`,
    '',
    '| Endpoint | Consultas | Escrituras | Bytes | ms (mediana) | Presupuesto | Estado |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
