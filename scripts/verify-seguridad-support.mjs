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

const SEVERIDADES_BLOQUEANTES = new Set(['HIGH', 'CRITICAL']);

// Hallazgos normalizados de un informe de trivy (`Results`) o de grype (`matches`); null si no es ninguno de los dos.
function hallazgosDelInforme(informe) {
  if (Array.isArray(informe?.Results)) {
    return informe.Results.flatMap((resultado) => (resultado.Vulnerabilities ?? []).map((vulnerabilidad) => ({
      id: vulnerabilidad.VulnerabilityID,
      severidad: String(vulnerabilidad.Severity ?? '').toUpperCase(),
      corregible: Boolean(vulnerabilidad.FixedVersion),
      paquete: vulnerabilidad.PkgName ?? '?',
    })));
  }
  if (Array.isArray(informe?.matches)) {
    return informe.matches.map(({ vulnerability: vulnerabilidad = {}, artifact = {} }) => ({
      id: vulnerabilidad.id,
      severidad: String(vulnerabilidad.severity ?? '').toUpperCase(),
      corregible: vulnerabilidad.fix?.state === 'fixed' || (vulnerabilidad.fix?.versions ?? []).length > 0,
      paquete: artifact.name ?? '?',
    }));
  }
  return null;
}

/**
 * Trinquete del escaneo de la imagen (S6-1, opcional). Bloquea una vulnerabilidad de severidad alta o crítica sin
 * corrección disponible que no esté en la lista justificada (scripts/image-scan-allowlist.json). Una salida que no es
 * un informe reconocido no pasa: no se da por buena una respuesta que no se entiende.
 */
export function evaluateImageScan(output, allowlist = {}) {
  let informe;
  try {
    informe = JSON.parse(String(output ?? ''));
  } catch {
    return { ok: false, problemas: ['la salida del escáner no es JSON'] };
  }
  const hallazgos = hallazgosDelInforme(informe);
  if (!hallazgos) return { ok: false, problemas: ['formato de escáner no reconocido (trivy o grype)'] };
  const problemas = [...new Set(
    hallazgos
      .filter((hallazgo) => SEVERIDADES_BLOQUEANTES.has(hallazgo.severidad)
        && !hallazgo.corregible
        && !Object.hasOwn(allowlist, hallazgo.id))
      .map((hallazgo) => `${hallazgo.id} (${hallazgo.severidad}, ${hallazgo.paquete}): sin corrección disponible`),
  )].sort();
  return { ok: problemas.length === 0, problemas };
}

// Valores nuevos en cada corrida, nunca literales. No se imprimen ni se guardan en ningún sitio.
function secretoNuevo() {
  return randomBytes(48).toString('base64url');
}

export function deployEnv() {
  return {
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.production',
    DJANGO_SECRET_KEY: secretoNuevo(),
    // S5-1: llave propia de las reflexiones (≥ 32 caracteres, distinta de DJANGO_SECRET_KEY); JWT_SECRET ya no se exige.
    REFLECTION_ENCRYPTION_KEY: secretoNuevo(),
    // S5-2: la llave activa es versionada: su id va en REFLECTION_ACTIVE_KEY y su secreto nuevo en REFLECTION_KEYS (id=secreto).
    REFLECTION_ACTIVE_KEY: 'k1',
    REFLECTION_KEYS: `k1=${secretoNuevo()}`,
    // S5-3: la llave que firma las sesiones es propia: producción la exige (≥ 50 caracteres, distinta de las demás).
    JWT_SIGNING_KEY: secretoNuevo(),
    DB_PASSWORD: secretoNuevo(),
    DJANGO_ALLOWED_HOSTS: 'localhost',
    // S1-1: producción exige declarar cuántos proxies de confianza hay delante de Django.
    SIEP_TRUSTED_PROXIES: '1',
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
 * `--only id[,id]`: deja solo esos pasos (los demás no se ejecutan ni salen en el resumen). Un id desconocido es
 * un error que nombra los que hay: así una orden mal escrita no "pasa" sin correr nada.
 */
export function selectSteps(steps, only = []) {
  if (only.length === 0) return steps;
  const desconocidos = only.filter((id) => !steps.some((step) => step.id === id));
  if (desconocidos.length > 0) {
    throw new Error(`paso desconocido: ${desconocidos.join(', ')} (hay: ${steps.map((step) => step.id).join(', ')})`);
  }
  return steps.filter((step) => only.includes(step.id));
}

/**
 * Pasos de `npm run verify:seguridad`, en orden (plan 03, S0-1). Un paso opcional que falta
 * (gitleaks o el build) trae `skip` con su motivo: se omite y no falla.
 */
export function buildSteps({
  platform = process.platform,
  root,
  baseline = {},
  allowlist = {},
  imagen,
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
  // Escaneo de la imagen (S6-1, opcional): trivy si está y, si no, grype. Sin escáner o sin imagen, el paso se omite.
  const trivy = which('trivy');
  const grype = trivy ? null : which('grype');
  const escaneo = {
    command: trivy ?? grype ?? 'trivy',
    args: trivy || !grype ? ['image', '--format', 'json', '--quiet', imagen ?? ''] : [imagen ?? '', '-o', 'json', '--quiet'],
    scan: (output) => evaluateImageScan(output, allowlist),
    hint: 'Corrige la vulnerabilidad (actualiza la base o la dependencia) o regístrala con su motivo en '
      + 'scripts/image-scan-allowlist.json.',
    skip: !trivy && !grype
      ? 'escáner de imagen no instalado (trivy o grype): el paso es opcional y se omite'
      : imagen ? undefined : 'sin imagen: define SIEP_IMAGE con la imagen a escanear (p. ej. docker build -t siep .)',
  };

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
    { id: 'image-scan', label: 'Escaneo de la imagen (trivy o grype: alta o crítica sin corrección)', ...escaneo },
  ];
}
