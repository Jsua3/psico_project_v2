import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aplicarModelos } from './modelos-en-lugar.mjs';
import { existe, medidaPng, validarEscenario } from './validar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(aqui, 'fixtures', 'minimo');
const KIT = path.join(aqui, 'fixtures', 'kit-minimo');

/** Copia el escenario mínimo a una carpeta temporal con `mutar` aplicado; devuelve la carpeta. */
async function lugarTemporal(mutar) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lugar-'));
  await cp(FIXTURE, dir, { recursive: true });
  const archivo = path.join(dir, 'escenario.json');
  const escenario = JSON.parse(await readFile(archivo, 'utf8'));
  mutar(escenario);
  await writeFile(archivo, JSON.stringify(escenario, null, 2));
  return dir;
}

const leer = async (dir) => JSON.parse(await readFile(path.join(dir, 'escenario.json'), 'utf8'));

const conTelevisor = (e) => {
  e.catalogo.objetos.push({ id: 'tele', nombre: 'Tele de la sala', tipo: 'PROP', desdeModelo: 'televisor' });
  e.catalogo.herramientas.push({ id: 'tarjeta', nombre: 'Tarjeta', descripcion: 'Para derivar.', desdeModelo: 'tarjeta-contacto-bienestar' });
};

test('copia arte y hoja y rellena los campos', async () => {
  const dir = await lugarTemporal(conTelevisor);
  try {
    const { copiados } = await aplicarModelos(dir);
    assert.deepEqual(copiados.sort(), [
      'arte/herramientas/tarjeta-contacto-bienestar-cerca.png', 'arte/herramientas/tarjeta-contacto-bienestar.png',
      'arte/objetos/televisor-cerca.png', 'arte/objetos/televisor.png',
    ]);
    for (const r of copiados) assert.ok(await existe(path.join(dir, r)), r);
    const reposo = await medidaPng(path.join(dir, 'arte/objetos/televisor.png'));
    const hoja = await medidaPng(path.join(dir, 'arte/objetos/televisor-cerca.png'));
    assert.deepEqual(reposo, { ancho: 32, alto: 32 });
    assert.equal(hoja.ancho, 32 * 4);

    const e = await leer(dir);
    const tele = e.catalogo.objetos.find((o) => o.id === 'tele');
    assert.equal(tele.desdeModelo, 'televisor');
    assert.equal(tele.nombre, 'Tele de la sala'); // el nombre del lugar se conserva
    assert.equal(tele.arte, 'arte/objetos/televisor.png');
    assert.deepEqual(tele.animacionCerca, { hoja: 'arte/objetos/televisor-cerca.png', cuadros: 4, fps: 6 });
    assert.equal(tele.textoInteraccion, 'Mirar');
    assert.equal(tele.alRevisar, 'Nadie lo está viendo.');
    assert.equal(tele.efecto, 'ninguno');
    const tarjeta = e.catalogo.herramientas.find((h) => h.id === 'tarjeta');
    assert.equal(tarjeta.arte, 'arte/herramientas/tarjeta-contacto-bienestar.png');
    assert.equal(tarjeta.alRevisar, 'Teléfono y horario de Bienestar Universitario. Sirve para derivar.');
    assert.ok(!('efecto' in tarjeta) && !('textoInteraccion' in tarjeta), 'la herramienta no lleva campos que su esquema no tiene');

    const { errores } = await validarEscenario(dir, { kitDir: KIT });
    assert.deepEqual(errores, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('es idempotente', async () => {
  const dir = await lugarTemporal(conTelevisor);
  try {
    await aplicarModelos(dir);
    const antes = await readFile(path.join(dir, 'escenario.json'), 'utf8');
    const { copiados } = await aplicarModelos(dir);
    assert.deepEqual(copiados, []);
    assert.equal(await readFile(path.join(dir, 'escenario.json'), 'utf8'), antes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('un modelo inexistente no copia nada y falla', async () => {
  const dir = await lugarTemporal((e) => {
    conTelevisor(e);
    e.catalogo.objetos.push({ id: 'otra', nombre: 'Otra', tipo: 'PROP', desdeModelo: 'televisr' });
  });
  try {
    const antes = await readFile(path.join(dir, 'escenario.json'), 'utf8');
    await assert.rejects(() => aplicarModelos(dir), /televisr/);
    assert.ok(!(await existe(path.join(dir, 'arte/objetos/televisor.png'))), 'no debe copiar a medias');
    assert.equal(await readFile(path.join(dir, 'escenario.json'), 'utf8'), antes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('un hito decisive sin objeto ni herramienta que lo marque es aviso', async () => {
  const sinForma = await lugarTemporal(() => {});
  const conForma = await lugarTemporal((e) => {
    e.catalogo.objetos[0].hitos = ['valorar-el-riesgo'];
  });
  const hitoAjeno = await lugarTemporal((e) => {
    e.catalogo.herramientas[0].hitos = ['hito-que-no-existe'];
  });
  try {
    const a = await validarEscenario(sinForma, { kitDir: KIT });
    const aviso = a.avisos.find((h) => h.codigo === 'hito-sin-forma-de-cumplirse');
    assert.ok(aviso, JSON.stringify(a.avisos));
    assert.match(aviso.mensaje, /valorar-el-riesgo/);
    assert.ok(!a.avisos.some((h) => h.codigo === 'hito-sin-forma-de-cumplirse' && h.mensaje.includes('informar-derechos')), 'solo los decisive');

    const b = await validarEscenario(conForma, { kitDir: KIT });
    assert.deepEqual(b.errores, []);
    assert.ok(!b.avisos.some((h) => h.codigo === 'hito-sin-forma-de-cumplirse'), JSON.stringify(b.avisos));

    const c = await validarEscenario(hitoAjeno, { kitDir: KIT });
    assert.ok(c.errores.some((h) => h.codigo === 'hito-inexistente'), JSON.stringify(c.errores));
  } finally {
    for (const d of [sinForma, conForma, hitoAjeno]) await rm(d, { recursive: true, force: true });
  }
});
