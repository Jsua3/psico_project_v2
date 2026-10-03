import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildOutputs, writeOutputs } from './build.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/valentina-prueba.json', import.meta.url), 'utf8'));

test('el build es determinista: dos ejecuciones, mismos bytes', () => {
  const a = buildOutputs().files;
  const b = buildOutputs().files;
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [rel, bytes] of a) assert.ok(bytes.equals(b.get(rel)), rel);
});

test('el manifiesto registra los hashes de píxeles de Valentina', () => {
  const { manifest, files } = buildOutputs();
  const v = manifest.characters.valentina;
  assert.equal(v.files.idle.pixelSha256, golden.idle);
  assert.equal(v.files.walk.pixelSha256, golden.walk);
  assert.equal(v.files['portrait-neutral'].pixelSha256, golden['portrait-neutral']);
  assert.deepEqual(v.provenance, { source: 'Kit SIEP', license: 'SIEP-INTERNAL' });
  assert.ok(files.has('kit.json') && files.has('manifest.json') && files.has('valentina/idle.png'));
});

test('writeOutputs escribe todo y borra carpetas de personajes que ya no existen', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-'));
  try {
    mkdirSync(path.join(out, 'retirado'));
    writeFileSync(path.join(out, 'retirado', 'idle.png'), 'x');
    const { files } = buildOutputs();
    writeOutputs(files, out);
    assert.ok(!existsSync(path.join(out, 'retirado')));
    for (const rel of files.keys()) assert.ok(existsSync(path.join(out, rel)), rel);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
