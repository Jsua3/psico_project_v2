import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
// `corregible`: trivy trae `FixedVersion` solo si hay corrección publicada; grype dice `fix.state: fixed` o lista `fix.versions`.
// `corregidaEn`: la(s) versión(es) a la(s) que actualizar, si el escáner las da.
function hallazgosDelInforme(informe) {
  if (Array.isArray(informe?.Results)) {
    return informe.Results.flatMap((resultado) => (resultado.Vulnerabilities ?? []).map((vulnerabilidad) => ({
      id: vulnerabilidad.VulnerabilityID,
      severidad: String(vulnerabilidad.Severity ?? '').toUpperCase(),
      corregible: Boolean(vulnerabilidad.FixedVersion),
      corregidaEn: String(vulnerabilidad.FixedVersion ?? '').trim(),
      paquete: vulnerabilidad.PkgName ?? '?',
    })));
  }
  if (Array.isArray(informe?.matches)) {
    return informe.matches.map(({ vulnerability: vulnerabilidad = {}, artifact = {} }) => {
      const versiones = vulnerabilidad.fix?.versions ?? [];
      return {
        id: vulnerabilidad.id,
        severidad: String(vulnerabilidad.severity ?? '').toUpperCase(),
        corregible: vulnerabilidad.fix?.state === 'fixed' || versiones.length > 0,
        corregidaEn: versiones.join(', '),
        paquete: artifact.name ?? '?',
      };
    });
  }
  return null;
}

const sinRepetidos = (textos) => [...new Set(textos)].sort();

// BORRADOR: los mensajes del escaneo (problemas y avisos) son texto técnico para quien despliega (pendiente de revisión).
/**
 * Trinquete del escaneo de la imagen (S6-1, opcional; sentido corregido en S7-2). Bloquea una vulnerabilidad de severidad
 * alta o crítica CON corrección disponible que no esté en la lista justificada (scripts/image-scan-allowlist.json): lo
 * corregible se arregla actualizando el paquete o refrescando la imagen base. Lo que NO tiene corrección no se puede
 * arreglar: se informa en `avisos` y no bloquea. Una salida que no es un informe reconocido no pasa: no se da por buena
 * una respuesta que no se entiende.
 */
export function evaluateImageScan(output, allowlist = {}) {
  let informe;
  try {
    informe = JSON.parse(String(output ?? ''));
  } catch {
    return { ok: false, problemas: ['la salida del escáner no es JSON'], avisos: [] };
  }
  const hallazgos = hallazgosDelInforme(informe);
  if (!hallazgos) return { ok: false, problemas: ['formato de escáner no reconocido (trivy o grype)'], avisos: [] };
  const graves = hallazgos.filter((hallazgo) => SEVERIDADES_BLOQUEANTES.has(hallazgo.severidad) && !Object.hasOwn(allowlist, hallazgo.id));
  const etiqueta = (hallazgo) => `${hallazgo.id} (${hallazgo.severidad}, ${hallazgo.paquete})`;
  const problemas = sinRepetidos(
    graves
      .filter((hallazgo) => hallazgo.corregible)
      .map((hallazgo) => `${etiqueta(hallazgo)}: con corrección disponible: actualiza ${hallazgo.paquete}${hallazgo.corregidaEn ? ` a ${hallazgo.corregidaEn}` : ''}`),
  );
  const avisos = sinRepetidos(
    graves
      .filter((hallazgo) => !hallazgo.corregible)
      .map((hallazgo) => `${etiqueta(hallazgo)}: sin corrección disponible (se informa; no bloquea)`),
  );
  return { ok: problemas.length === 0, problemas, avisos };
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

// --- Acciones de CI fijadas por commit (S6-2) ---------------------------------------------------------------------

// `uses: dueño/repo[/ruta]@valor`, con guion de lista opcional y comillas opcionales.
const USO_DE_ACCION = /^\s*(?:-\s+)?uses:\s*(['"]?)([^'"\s]+)\1/;
const FIJADA_POR_COMMIT = /@[0-9a-f]{40}$/;
const ES_CHECKOUT = /^actions\/checkout(@|$)/;
const PERSISTENCIA_DESACTIVADA = /^\s*persist-credentials:\s*false\s*(#.*)?$/;

const sangria = (linea) => linea.length - linea.trimStart().length;
const esItemDeLista = (linea) => /^\s*-(\s|$)/.test(linea);

// Líneas del paso que contiene la línea `uses:` de índice `indice`: desde su guion hasta la primera línea que no
// esté más sangrada que ese guion. Así el `persist-credentials` de otro paso no cuenta para este checkout.
function lineasDelPaso(lineas, indice) {
  let inicio = indice;
  if (!esItemDeLista(lineas[indice])) {
    while (inicio > 0 && !(esItemDeLista(lineas[inicio]) && sangria(lineas[inicio]) < sangria(lineas[indice]))) {
      inicio -= 1;
    }
    if (!esItemDeLista(lineas[inicio])) return [lineas[indice]];
  }
  const base = sangria(lineas[inicio]);
  let fin = inicio + 1;
  while (fin < lineas.length && (lineas[fin].trim() === '' || sangria(lineas[fin]) > base)) fin += 1;
  return lineas.slice(inicio, fin);
}

/**
 * Cada `uses:` externo de los flujos termina en `@<40 hex>` (la etiqueta va en un comentario); las acciones locales
 * (`./…`) no se fijan. Cada `actions/checkout` lleva `persist-credentials: false` en su propio paso. Sin flujos que
 * revisar falla: no se da por bueno un conjunto vacío.
 */
export function evaluateActionsPinned(flujos = []) {
  if (flujos.length === 0) {
    return { ok: false, problemas: ['no hay flujos de GitHub Actions en .github/workflows que revisar'] };
  }
  const problemas = [];
  for (const { nombre, texto } of flujos) {
    const lineas = texto.split(/\r?\n/);
    lineas.forEach((linea, indice) => {
      const uso = USO_DE_ACCION.exec(linea);
      if (!uso || uso[2].startsWith('./')) return;
      const accion = uso[2];
      const donde = `${nombre}:${indice + 1}`;
      if (!FIJADA_POR_COMMIT.test(accion)) {
        problemas.push(`${donde}: uses: ${accion} no está fijado por commit (@<sha de 40 caracteres>)`);
      }
      if (ES_CHECKOUT.test(accion) && !lineasDelPaso(lineas, indice).some((l) => PERSISTENCIA_DESACTIVADA.test(l))) {
        problemas.push(`${donde}: ${accion} sin persist-credentials: false`);
      }
    });
  }
  return { ok: problemas.length === 0, problemas };
}

/** Flujos de GitHub Actions del repositorio (`.github/workflows/*.yml`), con su ruta relativa para los avisos. */
export function leerFlujos(root) {
  const carpeta = join(root, '.github', 'workflows');
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((nombre) => /\.ya?ml$/.test(nombre))
    .sort()
    .map((nombre) => ({ nombre: `.github/workflows/${nombre}`, texto: readFileSync(join(carpeta, nombre), 'utf8') }));
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
  flujos,
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
    // BORRADOR: texto técnico para quien despliega (pendiente de revisión).
    hint: 'Ya hay una corrección publicada: actualiza el paquete o refresca la imagen base y vuelve a construir. Si de '
      + 'verdad no se puede aplicar todavía, regístrala con su motivo en scripts/image-scan-allowlist.json. Lo que no '
      + 'tiene corrección se informa y no bloquea.',
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
      id: 'actions-pinned',
      label: 'Acciones de CI fijadas por commit y persist-credentials: false (.github/workflows)',
      // En proceso (sin comando): lee .github/workflows solo al correr el paso, no al construir la lista.
      check: () => evaluateActionsPinned(flujos ?? leerFlujos(root)),
      hint: 'Fija cada `uses:` externo con su sha (`uses: dueño/repo@<sha> # etiqueta`; el sha sale de '
        + '`git ls-remote` sobre el repositorio de la acción y su etiqueta) y pon `persist-credentials: false` en cada '
        + 'actions/checkout.',
    },
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
    { id: 'image-scan', label: 'Escaneo de la imagen (trivy o grype: alta o crítica con corrección disponible)', ...escaneo },
  ];
}
