import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { buildSteps as buildEstructuralSteps, summarize } from './verify-estructural-support.mjs';

export { summarize };

// Códigos que imprime `manage.py check --deploy`, p. ej. «?: (security.W004) …».
const CODIGO_DJANGO = /\bsecurity\.[WE]\d{3}\b/g;

/**
 * Trinquete de `check --deploy`. Falla si sale un aviso que el baseline no conoce («nuevo») y si el
 * baseline conserva un código que ya no sale («obsoleto»). Un código `permanente` no caduca.
 */
export function evaluateDeployCheck(output, baseline = {}) {
  const hallados = new Set(String(output ?? '').match(CODIGO_DJANGO) ?? []);
  const nuevos = [...hallados].filter((codigo) => !Object.hasOwn(baseline, codigo)).sort();
  const obsoletos = Object.keys(baseline)
    .filter((codigo) => !hallados.has(codigo) && baseline[codigo]?.permanente !== true)
    .sort();
  return { ok: nuevos.length === 0 && obsoletos.length === 0, nuevos, obsoletos };
}

// Valores nuevos en cada corrida, nunca literales. No se imprimen ni se guardan en ningún sitio.
function secretoNuevo() {
  return randomBytes(48).toString('base64url');
}

function deployEnv() {
  return {
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.production',
    DJANGO_SECRET_KEY: secretoNuevo(),
    DB_PASSWORD: secretoNuevo(),
    JWT_SECRET: secretoNuevo(),
    DJANGO_ALLOWED_HOSTS: 'localhost',
    // Un correo real: con el backend de consola Django marca mail.E001 como error y check --deploy falla.
    EMAIL_BACKEND: 'django.core.mail.backends.smtp.EmailBackend',
    EMAIL_HOST: 'localhost',
    ACCESS_REQUEST_NOTIFY_DISABLED: 'true',
  };
}

/** Ruta completa de un ejecutable en el PATH, o null. Sin `exists` inyectado toca el disco. */
export function findOnPath(name, { platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const carpetas = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensiones = platform === 'win32'
    ? [...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean), '']
    : [''];
  for (const carpeta of carpetas) {
    for (const extension of extensiones) {
      const candidato = join(carpeta, `${name}${extension}`);
      if (exists(candidato)) return candidato;
    }
  }
  return null;
}

/**
 * Pasos de `npm run verify:seguridad`, en orden (plan 03, S0-1). Un paso opcional que falta
 * (gitleaks o el build) trae `skip` con su motivo: se omite y no falla.
 */
export function buildSteps({
  platform = process.platform,
  root,
  baseline = {},
  exists = existsSync,
  which = (name) => findOnPath(name, { platform }),
}) {
  const npm = platform === 'win32' ? 'npm.cmd' : 'npm';
  const venvPython = platform === 'win32'
    ? join(root, 'backend_django', '.venv', 'Scripts', 'python.exe')
    : join(root, 'backend_django', '.venv', 'bin', 'python');
  const estructurales = buildEstructuralSteps({ platform, root });
  const reutilizado = (id) => estructurales.find((step) => step.id === id);
  const gitleaks = which('gitleaks');
  const distDir = join(root, 'frontend', 'dist', 'psychosim-admin-panel', 'browser');

  return [
    { id: 'scripts', label: 'Scripts de entorno (node --test)', command: npm, args: ['run', 'test:scripts'] },
    {
      id: 'security-tests',
      label: 'Pruebas marcadas security (pytest -m security)',
      command: npm,
      args: ['run', 'test:backend', '--', '-m', 'security', '-q'],
    },
    {
      id: 'deploy-check',
      label: 'manage.py check --deploy (ajustes de producción, valores generados)',
      command: venvPython,
      args: [join(root, 'backend_django', 'manage.py'), 'check', '--deploy'],
      env: deployEnv(),
      evaluate: (output) => evaluateDeployCheck(output, baseline),
      hint: 'Revisa los avisos. Uno nuevo se corrige o se registra en scripts/security-check-baseline.json con su '
        + 'motivo y la tarea que lo retira; un código del baseline que ya no sale se borra de ese archivo. '
        + 'Sin venv: crea backend_django/.venv (npm run up).',
    },
    reutilizado('pip-audit'),
    reutilizado('npm-audit'),
    {
      id: 'gitleaks',
      label: 'gitleaks (secretos en el historial)',
      command: gitleaks ?? 'gitleaks',
      // --redact, como el CI: un secreto hallado no se repite en la consola.
      args: ['detect', '--source', root, '--config', join(root, '.github', 'gitleaks.toml'), '--redact', '--no-banner'],
      skip: gitleaks ? undefined : 'gitleaks no está instalado (el CI lo corre con la versión 8.30.1)',
    },
    {
      id: 'dist-dev-only',
      label: 'check-dist-dev-only (build sin código de desarrollo)',
      command: process.execPath,
      args: [join(root, 'frontend', 'scripts', 'ui', 'check-dist-dev-only.mjs')],
      skip: exists(distDir) ? undefined : 'sin build: corre npm run build:frontend',
    },
  ];
}
