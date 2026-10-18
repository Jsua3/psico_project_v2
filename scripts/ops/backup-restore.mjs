#!/usr/bin/env node
/**
 * Ejercicio automatizado de respaldo y restauración de PostgreSQL (E5-5: RNF-06, RNF-006).
 *
 * Flujo:
 * 1. Levanta una BD desechable PostgreSQL 18 (docker-compose.test.yml) y siembra con bootstrap_dev_db.
 * 2. Crea un intento y cifra una entrada de bitácora reflexiva (ReflectionJournal) con AES-GCM.
 * 3. Toma conteos por tabla en la BD origen y ejecuta pg_dump (--no-owner --no-acl).
 * 4. Crea una BD limpia (*_restored) en el mismo contenedor desechable y restaura el volcado con psql.
 * 5. Compara conteos tabla por tabla entre origen y restaurada y verifica que la reflexión
 *    se descifre íntegramente con crypto_service.decrypt en la BD restaurada.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessTestDatabaseTarget } from '../dev-environment-guard.mjs';
import {
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  withOwnedTestDatabase,
} from '../test-runner-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND = join(ROOT, 'backend_django');
const PROJECT = `${deriveTestComposeProject(ROOT)}-backup`;
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

/**
 * Compara los conteos por tabla entre la base original y la restaurada.
 * @param {Record<string, number>} sourceCounts
 * @param {Record<string, number>} restoredCounts
 */
export function compareTableCounts(sourceCounts, restoredCounts) {
  const mismatches = [];
  const sourceTables = Object.keys(sourceCounts ?? {}).sort();
  const restoredTables = Object.keys(restoredCounts ?? {}).sort();
  const allTables = Array.from(new Set([...sourceTables, ...restoredTables])).sort();

  for (const table of allTables) {
    const src = sourceCounts?.[table];
    const dst = restoredCounts?.[table];
    if (src !== dst) {
      mismatches.push({
        table,
        source: src ?? null,
        restored: dst ?? null,
      });
    }
  }

  return {
    ok: mismatches.length === 0 && sourceTables.length > 0,
    tableCount: allTables.length,
    mismatches,
  };
}

function runPythonJson(pythonScript, env) {
  const res = spawnSync(venvPython(), ['-c', pythonScript], {
    cwd: BACKEND,
    encoding: 'utf8',
    stdio: 'pipe',
    env,
  });
  if (res.status !== 0) {
    throw new Error(`Fallo en script Python:\n${res.stderr || res.stdout}`);
  }
  const lines = res.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function composeExec(composeEnv, dbArgs, input = undefined) {
  return spawnSync(
    'docker',
    ['compose', '-p', PROJECT, '-f', 'docker-compose.test.yml', 'exec', '-T', 'db', ...dbArgs],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...composeEnv },
      input,
    },
  );
}

export async function runBackupRestoreVerification() {
  const runtime = createTestDatabaseRuntime(process.env);
  runtime.env = {
    ...runtime.env,
    SIEP_TEST_CHECKOUT_ID: PROJECT,
  };

  const dsnGuard = assessTestDatabaseTarget({
    test: runtime.database,
    dev: {
      name: process.env.DB_NAME ?? 'psychosim',
      host: process.env.DB_HOST ?? 'localhost',
      port: process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433',
    },
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!dsnGuard.ok) throw new Error(dsnGuard.reason);
  if (!existsSync(venvPython())) {
    throw new Error('No existe backend_django/.venv.');
  }

  const sourceDb = runtime.database.name;
  const restoredDb = `${sourceDb}_restored`;
  const dbUser = runtime.database.user;
  const samplePlaintext = 'Reflexión clínica E5-5: escuché activamente sin revictimizar.';

  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: async () => {
      const baseEnv = {
        ...runtime.env,
        DJANGO_SETTINGS_MODULE: 'psychosim.settings.test',
      };

      const bootstrap = spawnSync(venvPython(), ['manage.py', 'bootstrap_dev_db'], {
        cwd: BACKEND,
        encoding: 'utf8',
        stdio: 'pipe',
        env: baseEnv,
      });
      if (bootstrap.status !== 0) {
        throw new Error(`bootstrap_dev_db falló:\n${bootstrap.stderr || bootstrap.stdout}`);
      }

      const seedScript = `
import os, json, django
django.setup()
from django.db import connection
from apps.users.models import CustomUser
from apps.simulation.models import CaseVersion, SimulationAttempt, ReflectionJournal
from apps.simulation.services import crypto_service

student = CustomUser.objects.filter(role="ESTUDIANTE").first()
cv = CaseVersion.objects.filter(status="PUBLISHED").first()
node = cv.nodes.order_by("id").first()
attempt = SimulationAttempt.objects.create(
    student=student,
    case_version=cv,
    current_node=node,
    status="IN_PROGRESS",
)
ref = crypto_service.key_ref()
journal = ReflectionJournal.objects.create(
    attempt=attempt,
    node=node,
    encrypted_text=crypto_service.encrypt(
        ${JSON.stringify(samplePlaintext)}, key_ref=ref, attempt_id=attempt.id, node_id=node.id
    ),
    encryption_key_ref=ref,
    locked=False,
)
with connection.cursor() as cur:
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    tables = [r[0] for r in cur.fetchall()]
    counts = {}
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        counts[t] = cur.fetchone()[0]
print(json.dumps({"journalId": journal.id, "counts": counts}))
`;
      const seeded = runPythonJson(seedScript, baseEnv);

      const dumpRes = composeExec(runtime.env, [
        'pg_dump',
        '--no-owner',
        '--no-acl',
        '-U',
        dbUser,
        '-d',
        sourceDb,
      ]);
      if (dumpRes.status !== 0 || !dumpRes.stdout) {
        throw new Error(`pg_dump falló:\n${dumpRes.stderr}`);
      }

      const createRestoredDb = composeExec(runtime.env, [
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        dbUser,
        '-d',
        'postgres',
        '-c',
        `DROP DATABASE IF EXISTS "${restoredDb}"`,
        '-c',
        `CREATE DATABASE "${restoredDb}"`,
      ]);
      if (createRestoredDb.status !== 0) {
        throw new Error(`CREATE DATABASE restaurada falló:\n${createRestoredDb.stderr}`);
      }

      const restoreRes = composeExec(
        runtime.env,
        ['psql', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', restoredDb],
        dumpRes.stdout,
      );
      if (restoreRes.status !== 0) {
        throw new Error(`Restauración con psql falló:\n${restoreRes.stderr}`);
      }

      const restoredEnv = {
        ...baseEnv,
        SIEP_TEST_DB_NAME: restoredDb,
      };
      const verifyScript = `
import json, django
django.setup()
from django.db import connection
from apps.simulation.models import ReflectionJournal
from apps.simulation.services import crypto_service

with connection.cursor() as cur:
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    tables = [r[0] for r in cur.fetchall()]
    counts = {}
    for t in tables:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        counts[t] = cur.fetchone()[0]

journal = ReflectionJournal.objects.get(pk=${seeded.journalId})
decrypted = crypto_service.decrypt(
    journal.encrypted_text,
    key_ref=journal.encryption_key_ref,
    attempt_id=journal.attempt_id,
    node_id=journal.node_id,
)
print(json.dumps({"counts": counts, "decrypted": decrypted, "keyRef": journal.encryption_key_ref}))
`;
      const verified = runPythonJson(verifyScript, restoredEnv);
      const comparison = compareTableCounts(seeded.counts, verified.counts);
      if (!comparison.ok) {
        throw new Error(
          `Discrepancia de conteos tras restaurar: ${JSON.stringify(comparison.mismatches)}`,
        );
      }
      if (verified.decrypted !== samplePlaintext) {
        throw new Error(
          `El texto descifrado de ReflectionJournal no coincide: "${verified.decrypted}"`,
        );
      }

      console.log(
        JSON.stringify(
          {
            ok: true,
            tablesVerified: comparison.tableCount,
            journalDecrypted: true,
            keyRef: verified.keyRef,
          },
          null,
          2,
        ),
      );
      return 0;
    },
  });
}

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  runBackupRestoreVerification()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`[siep:backup-restore] ${formatErrorDetails(err)}`);
      process.exitCode = 1;
    });
}
