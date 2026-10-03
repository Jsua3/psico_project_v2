import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    // Una salida anterior del kit (tiene manifest.json) con una carpeta de una receta retirada.
    writeFileSync(path.join(out, 'manifest.json'), '{}');
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

test('writeOutputs borra lo que sobra dentro de las carpetas que conserva', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'kit-'));
  try {
    const { files } = buildOutputs();
    writeOutputs(files, out);
    // Una receta que dejó de tener un retrato, un archivo suelto y una carpeta vacía.
    writeFileSync(path.join(out, 'valentina', 'portrait-triste.png'), 'x');
    writeFileSync(path.join(out, 'viejo.json'), '{}');
    mkdirSync(path.join(out, 'valentina', 'vacia'));
    writeOutputs(files, out);
    assert.ok(!existsSync(path.join(out, 'valentina', 'portrait-triste.png')));
    assert.ok(!existsSync(path.join(out, 'viejo.json')));
    assert.ok(!existsSync(path.join(out, 'valentina', 'vacia')));
    for (const rel of files.keys()) assert.ok(existsSync(path.join(out, rel)), rel);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('writeOutputs se niega a escribir en una carpeta que no es una salida del kit', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'ajena-'));
  try {
    mkdirSync(path.join(out, 'src'));
    writeFileSync(path.join(out, 'src', 'main.ts'), 'importante');
    assert.throws(() => writeOutputs(buildOutputs().files, out), /no parece una salida del kit/);
    assert.deepEqual(readdirSync(out), ['src']);
    assert.equal(readFileSync(path.join(out, 'src', 'main.ts'), 'utf8'), 'importante');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
