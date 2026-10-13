import { join } from 'node:path';

/**
 * Pasos de `npm run verify:estructural`, en el orden del plan estructural (§7).
 * GitHub Actions está bloqueado por facturación: esta es la verificación de una
 * sola orden que corre en local y encadena lo que el CI haría.
 */
export function buildSteps({ platform = process.platform, root }) {
  const npm = platform === 'win32' ? 'npm.cmd' : 'npm';
  const venvPython = platform === 'win32'
    ? join(root, 'backend_django', '.venv', 'Scripts', 'python.exe')
    : join(root, 'backend_django', '.venv', 'bin', 'python');
  return [
    { id: 'scripts', label: 'Scripts de entorno (node --test)', command: npm, args: ['run', 'test:scripts'] },
    { id: 'check-backend', label: 'manage.py check', command: npm, args: ['run', 'check:backend'] },
    {
      id: 'backend',
      label: 'Backend (arquitectura, migraciones, marcador req, pytest)',
      command: npm,
      args: ['run', 'test:backend'],
    },
    { id: 'api-e2e', label: 'Matriz API aislada', command: npm, args: ['run', 'test:api:e2e'] },
    {
      id: 'pip-audit',
      label: 'pip-audit (dependencias del backend)',
      command: venvPython,
      args: ['-m', 'pip_audit', '-r', join(root, 'backend_django', 'requirements.txt')],
      hint: 'Falta pip-audit en el venv: instala las herramientas de desarrollo con '
        + '`backend_django/.venv/Scripts/python.exe -m pip install -r backend_django/requirements-dev.txt` '
        + '(en Linux: `.venv/bin/python`).',
    },
    {
      id: 'npm-audit',
      label: 'npm audit (frontend, severidad alta)',
      command: npm,
      args: ['audit', '--prefix', 'frontend', '--audit-level=high'],
    },
  ];
}

export function summarize(results) {
  const lines = results.map((r) => {
    const state = r.skipped ? 'OMITIDO' : r.status === 0 ? 'OK' : 'FALLÓ';
    return `${r.id.padEnd(14)} ${state.padEnd(8)} ${r.seconds.toFixed(1)} s`;
  });
  const ok = results.every((r) => r.skipped || r.status === 0);
  return { lines, ok };
}
