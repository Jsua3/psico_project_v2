#!/usr/bin/env node
/**
 * E5-9 · Generador de contratos TypeScript desde el esquema OpenAPI de Django (DJG-6, §5.1).
 *
 * Uso:
 *   node scripts/openapi/generate-types.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const venvPython = process.platform === 'win32'
  ? join(ROOT, 'backend_django', '.venv', 'Scripts', 'python.exe')
  : join(ROOT, 'backend_django', '.venv', 'bin', 'python');

const outFile = join(ROOT, 'frontend', 'src', 'app', 'core', 'api', 'generated', 'openapi-contracts.d.ts');

const pyScript = [
  'import os, sys, django',
  'sys.path.insert(0, "backend_django")',
  'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.base")',
  'django.setup()',
  'import shared.openapi as openapi_mod',
  'from drf_spectacular.generators import SchemaGenerator',
  'schema = SchemaGenerator().get_schema(request=None, public=True)',
  'sys.stdout.write(openapi_mod.render_typescript_contracts(schema))',
].join('; ');

const res = spawnSync(venvPython, ['-c', pyScript], {
  cwd: ROOT,
  encoding: 'utf-8',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});

if (res.status !== 0) {
  console.error(res.stderr || 'Error al generar el esquema OpenAPI.');
  process.exit(res.status ?? 1);
}

mkdirSync(dirname(outFile), { recursive: true });
// Python escribe CRLF en Windows: el archivo generado va siempre con LF (igual que el del repositorio).
writeFileSync(outFile, res.stdout.replaceAll('\r\n', '\n'), 'utf-8');
console.log(`[openapi:types] Escrito ${outFile}`);
