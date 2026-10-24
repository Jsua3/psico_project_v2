import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validarModelos } from './validar-modelos.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(aqui, 'fixtures', 'modelos-minimo');

async function validarMutado(mutar = () => {}, preparar) {
  const dir = await mkdtemp(path.join(tmpdir(), 'modelos-'));
  try {
    await cp(FIXTURE, dir, { recursive: true });
    const archivo = path.join(dir, 'catalogo.json');
    const catalogo = JSON.parse(await readFile(archivo, 'utf8'));
    mutar(catalogo);
    await writeFile(archivo, JSON.stringify(catalogo));
    if (preparar) await preparar(dir);
    return await validarModelos(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const codigos = (r) => r.errores.map((e) => e.codigo);

test('el catálogo mínimo es válido', async () => {
  const r = await validarMutado();
  assert.deepEqual(r.errores, []);
});

test('una hoja de animación ausente es error arte-faltante', async () => {
  const r = await validarMutado(() => {}, (dir) => rm(path.join(dir, 'arte', 'cosa-cerca.png')));
  assert.ok(codigos(r).includes('arte-faltante'));
});

test('una hoja con menos cuadros de los declarados es error hoja-medida', async () => {
  const r = await validarMutado((c) => { c.modelos[0].animacionCerca.cuadros = 4; });
  assert.ok(codigos(r).includes('hoja-medida'));
});

test('un reposo que no mide 32x32 es error reposo-medida', async () => {
  const r = await validarMutado((c) => { c.modelos[0].arte = 'arte/cosa-cerca.png'; });
  assert.ok(codigos(r).includes('reposo-medida'));
});

test('dos modelos con el mismo id es error id-repetido', async () => {
  const r = await validarMutado((c) => { c.modelos.push({ ...c.modelos[0] }); });
  assert.ok(codigos(r).includes('id-repetido'));
});

test('una herramienta sin descripción es error de esquema', async () => {
  const r = await validarMutado((c) => { c.modelos[0].tipo = 'TOOL'; c.modelos[0].efecto = 'recoge-herramienta'; });
  assert.ok(codigos(r).includes('esquema'));
});

test('recoge-herramienta en algo que no es herramienta es error de esquema', async () => {
  const r = await validarMutado((c) => { c.modelos[0].efecto = 'recoge-herramienta'; });
  assert.ok(codigos(r).includes('esquema'));
});

test('cinco cuadros es error de esquema', async () => {
  const r = await validarMutado((c) => { c.modelos[0].animacionCerca.cuadros = 5; });
  assert.ok(codigos(r).includes('esquema'));
});

test('un texto al revisar muy largo es aviso', async () => {
  const r = await validarMutado((c) => { c.modelos[0].alRevisar = 'x'.repeat(130); });
  assert.deepEqual(r.errores, []);
  assert.ok(r.avisos.some((a) => a.codigo === 'texto-largo'));
});
