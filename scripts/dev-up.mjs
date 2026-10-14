#!/usr/bin/env node
/**
 * Arranca el stack de desarrollo SIEP:
 *   1. PostgreSQL (Docker)
 *   2. Backend Django (:8091)
 *   3. Frontend Angular (:4200)
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEV_COMPOSE_PROJECT,
  assessContainerOwnership,
  assessDevDataVolumeVersion,
  assessVolumeOwnership,
  buildSchemaGateCommand,
  decideSchemaGateAction,
} from './dev-environment-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const isWin = process.platform === 'win32';
// Puerto publicado de la BD propia; los procesos Django hijos reciben DB_PORT.
const DB_PORT = process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: opts.stdio ?? 'inherit',
    shell: isWin,
    ...opts,
  });
  if (result.status !== 0 && !opts.allowFail) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function venvPythonVersion() {
  const py = venvPython();
  if (!existsSync(py)) {
    return null;
  }
  const result = spawnSync(py, ['--version'], { stdio: 'pipe', encoding: 'utf8' });
  const match = (result.stdout ?? result.stderr ?? '').match(/Python (\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}`;
}

// Versión de Python de la imagen y del CI (Dockerfile, ci.yml); local se alinea con ella (PYP-2).
const TARGET_PYTHON = '3.14';

function isSupportedPython(version) {
  // Django 6.1 exige Python >= 3.12; psycopg 3 ya tiene ruedas para 3.14.
  return version === '3.12' || version === '3.13' || version === '3.14';
}

function ensureLocalSettings() {
  const local = join(BACKEND, 'psychosim', 'settings', 'local.py');
  const example = join(BACKEND, 'psychosim', 'settings', 'local.example.py');
  if (existsSync(local)) {
    return;
  }
  if (!existsSync(example)) {
    console.error('[siep] Falta backend_django/psychosim/settings/local.example.py');
    process.exit(1);
  }
  copyFileSync(example, local);
  console.log('[siep] Creado psychosim/settings/local.py desde local.example.py');
}

function ensureVenv() {
  const existingVersion = venvPythonVersion();
  if (existingVersion && !isSupportedPython(existingVersion)) {
    console.log(`[siep] .venv usa Python ${existingVersion}; recreando con 3.12-3.14...`);
    rmSync(join(BACKEND, '.venv'), { recursive: true, force: true });
  } else if (existingVersion && existingVersion !== TARGET_PYTHON) {
    if (process.env.SIEP_UPGRADE_VENV === '1') {
      console.log(`[siep] .venv usa Python ${existingVersion}; recreando con ${TARGET_PYTHON} (SIEP_UPGRADE_VENV=1)...`);
      rmSync(join(BACKEND, '.venv'), { recursive: true, force: true });
    } else {
      console.warn(`[siep] .venv usa Python ${existingVersion}; el objetivo del proyecto es ${TARGET_PYTHON} (imagen y CI).`);
      console.warn('[siep] Para pasarlo: SIEP_UPGRADE_VENV=1 npm run up  (recrea backend_django/.venv).');
    }
  }

  const py = venvPython();
  if (!existsSync(py)) {
    console.log('[siep] Creando entorno virtual Python (3.14, 3.13 o 3.12)...');
    const attempts = [
      ['py', ['-3.14', '-m', 'venv', '.venv']],
      ['py', ['-3.13', '-m', 'venv', '.venv']],
      ['py', ['-3.12', '-m', 'venv', '.venv']],
      ['python3.14', ['-m', 'venv', '.venv']],
      ['python3.13', ['-m', 'venv', '.venv']],
      ['python3.12', ['-m', 'venv', '.venv']],
    ];
    let created = false;
    for (const [cmd, args] of attempts) {
      const result = spawnSync(cmd, args, { cwd: BACKEND, stdio: 'pipe', shell: isWin });
      if (result.status === 0) {
        created = true;
        break;
      }
    }
    if (!created) {
      console.error('[siep] Se requiere Python 3.12, 3.13 o 3.14 (Django 6.1 exige >= 3.12).');
      console.error('[siep] En Windows: py install 3.14');
      process.exit(1);
    }
  }

  console.log('[siep] Instalando dependencias Python...');
  const pip = spawnSync(
    venvPython(),
    ['-m', 'pip', 'install', '-q', '-r', 'requirements.txt'],
    { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8' },
  );
  if (pip.status !== 0) {
    process.stderr.write(pip.stderr ?? pip.stdout ?? '');
    console.error('[siep] Falló pip install. ¿Python 3.12-3.14? Ejecuta: py install 3.14');
    process.exit(pip.status ?? 1);
  }
}

function ensureFrontendDeps() {
  if (existsSync(join(FRONTEND, 'node_modules'))) {
    return;
  }
  console.log('[siep] Instalando dependencias del frontend...');
  run('npm', ['install'], { cwd: FRONTEND });
}

function simulationSchemaReady() {
  // `migrate --check` sale con 0 solo si no queda ninguna migración por aplicar
  // (E1-0a, M-4 de la revisión de E0). Sin `shell: isWin` a propósito: spawnSync
  // invoca el .exe directamente (ruta absoluta), igual que venvPythonVersion().
  const result = spawnSync(
    venvPython(),
    buildSchemaGateCommand().args,
    { cwd: BACKEND, stdio: 'pipe', env: { ...process.env, DB_PORT } },
  );
  return result.status === 0;
}

function ensureDevDatabase() {
  // El bootstrap automático se eliminó a propósito (ENV-01): si el esquema
  // no está, npm run up se DETIENE y remite al comando explícito protegido.
  const action = decideSchemaGateAction({ schemaReady: simulationSchemaReady() });
  if (action === 'start') {
    return;
  }
  console.error('[siep] La base de datos no tiene el esquema al día.');
  console.error('[siep] Chequeo fallido: `manage.py migrate --check` (faltan migraciones por aplicar o la base viene de un esquema anterior).');
  console.error('[siep] npm run up NO siembra bases de datos automáticamente.');
  console.error('[siep] Si esta base es local, propia de este checkout y reemplazable, ejecuta:');
  console.error('[siep]     npm run db:bootstrap -- --yes');
  process.exit(1);
}

function composeDev(args, opts = {}) {
  return spawnSync('docker', ['compose', '-p', DEV_COMPOSE_PROJECT, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: isWin,
    encoding: 'utf8',
    ...opts,
  });
}

function resolveOwnDbContainer() {
  const ps = composeDev(['ps', '-q', 'db']);
  const id = (ps.stdout ?? '').trim();
  if (!id) {
    return null;
  }
  // Sin shell: cmd.exe rompe '{{json .Config.Labels}}' (espacio embebido).
  const labelsResult = spawnSync('docker', ['inspect', id, '--format', '{{json .Config.Labels}}'], {
    stdio: 'pipe', encoding: 'utf8',
  });
  if (labelsResult.status !== 0) {
    console.error('[siep] docker inspect falló; no se puede demostrar la pertenencia del contenedor.');
    process.exit(1);
  }
  const labels = JSON.parse(labelsResult.stdout.trim());
  const ownership = assessContainerOwnership({
    labels,
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: ROOT,
  });
  if (!ownership.ok) {
    console.error(`[siep] ${ownership.reason}`);
    process.exit(1);
  }
  const mountsResult = spawnSync('docker', ['inspect', id, '--format', '{{json .Mounts}}'], {
    stdio: 'pipe', encoding: 'utf8',
  });
  const volumes = assessVolumeOwnership({
    mounts: JSON.parse((mountsResult.stdout ?? '[]').trim()),
    expectedProject: DEV_COMPOSE_PROJECT,
  });
  if (!volumes.ok) {
    console.error(`[siep] ${volumes.reason}`);
    process.exit(1);
  }
  return id;
}

// Mayor de PostgreSQL de la imagen de desarrollo (docker-compose.yml).
const PG_MAJOR = 18;

// Un salto de versión mayor no arranca sobre el volumen anterior: se detiene ANTES de
// tocar nada y explica el procedimiento (E0-6). No ejecuta nada destructivo.
function ensureDevDataVolumeMatchesImage() {
  const volume = `${DEV_COMPOSE_PROJECT}_postgres_data`;
  const inspect = spawnSync('docker', ['volume', 'inspect', volume], { stdio: 'pipe' });
  if (inspect.status !== 0) {
    return; // volumen nuevo (o Docker apagado: lo dirá startDb)
  }
  const read = spawnSync(
    'docker',
    ['run', '--rm', '--entrypoint', 'cat', '-v', `${volume}:/pgdata:ro`, `postgres:${PG_MAJOR}-alpine`, '/pgdata/PG_VERSION'],
    { stdio: 'pipe', encoding: 'utf8' },
  );
  const verdict = assessDevDataVolumeVersion({
    pgVersionFile: read.status === 0 ? read.stdout : '',
    expectedMajor: PG_MAJOR,
  });
  if (verdict.ok) {
    return;
  }
  console.error(`[siep] ${verdict.reason}`);
  console.error('[siep] Para recrearla (los datos de desarrollo se vuelven a sembrar; el volcado es solo para conservarlos como archivo):');
  console.error(`[siep]   1. arranca el contenedor viejo:   docker start $(docker compose -p ${DEV_COMPOSE_PROJECT} ps -aq db)`);
  console.error('[siep]   2. vuélcalo DENTRO del contenedor (sin redirecciones de shell, que corrompen el archivo en Windows):');
  console.error('[siep]        docker exec <contenedor> pg_dump -U psychosim -Fc -f /tmp/dev.dump psychosim');
  console.error('[siep]        docker cp <contenedor>:/tmp/dev.dump ./dev.dump     y comprueba que dev.dump NO esté vacío');
  console.error(`[siep]   3. solo entonces:  docker compose -p ${DEV_COMPOSE_PROJECT} down -v`);
  console.error('[siep]   4. npm run up   y después   npm run db:bootstrap -- --yes');
  process.exit(1);
}

async function startDb() {
  console.log(`[siep] Iniciando PostgreSQL propio (proyecto Compose ${DEV_COMPOSE_PROJECT}, puerto ${DB_PORT})...`);
  const compose = composeDev(['up', '-d', 'db'], {
    env: { ...process.env, SIEP_DB_PORT: DB_PORT },
  });
  if (compose.status !== 0) {
    const output = `${compose.stderr ?? ''}${compose.stdout ?? ''}`;
    if (/port is already allocated|address already in use|bind for/i.test(output)) {
      console.error(`[siep] El puerto ${DB_PORT} ya está ocupado (posiblemente por la BD de OTRO checkout,`);
      console.error('[siep] p. ej. el contenedor psychosim-db del proyecto psicologia_proyecto).');
      console.error('[siep] Este script no detiene ni reutiliza recursos ajenos. Opciones:');
      console.error('[siep]   - exporta SIEP_DB_PORT con un puerto libre (p. ej. 5435) y repite npm run up;');
      console.error('[siep]   - o detén tú mismo el stack del otro checkout si ya no lo usas.');
      process.exit(1);
    }
    process.stderr.write(output);
    process.exit(compose.status ?? 1);
  }

  const containerId = resolveOwnDbContainer();
  if (!containerId) {
    console.error('[siep] No se encontró el contenedor db del proyecto tras el arranque.');
    process.exit(1);
  }

  console.log('[siep] Esperando que PostgreSQL esté listo...');
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', containerId, 'pg_isready', '-U', 'psychosim'],
      { stdio: 'pipe', shell: isWin },
    );
    if (result.status === 0) {
      console.log(`[siep] PostgreSQL listo en localhost:${DB_PORT}`);
      return;
    }
    await sleep(1000);
  }

  console.error('[siep] PostgreSQL no respondió. ¿Docker Desktop está corriendo?');
  process.exit(1);
}

function spawnProc(label, cmd, args, cwd, env = process.env) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: isWin, env });
  child.on('exit', (code) => {
    if (code != null && code !== 0) {
      console.error(`[siep] ${label} terminó con código ${code}`);
    }
  });
  return child;
}

async function main() {
  ensureLocalSettings();
  ensureDevDataVolumeMatchesImage();
  await startDb();
  ensureVenv();
  ensureDevDatabase();
  ensureFrontendDeps();

  console.log('[siep] Iniciando backend Django (:8091) y frontend Angular (:4200)...');
  console.log('[siep] App → http://localhost:4200  |  API → http://localhost:8091');
  console.log('[siep] Ctrl+C detiene backend y frontend (la BD sigue en Docker)\n');

  const children = [
    spawnProc('backend', venvPython(), ['manage.py', 'runserver', '8091'], BACKEND, { ...process.env, DB_PORT }),
    spawnProc('frontend', 'npm', ['start'], FRONTEND),
  ];

  const shutdown = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[siep]', error);
  process.exit(1);
});
