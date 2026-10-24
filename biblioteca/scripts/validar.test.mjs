import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validarEscenario } from './validar.mjs';
import { zonaCaminable } from './geometria.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(aqui, 'fixtures', 'minimo');
const KIT = path.join(aqui, 'fixtures', 'kit-minimo');

/**
 * Copia el escenario mínimo a una carpeta temporal, aplica `mutar` sobre su
 * JSON y lo valida. Devuelve { errores, avisos }.
 */
async function validarMutado(mutar = () => {}, { kitDir = KIT, preparar } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'escenario-'));
  try {
    await cp(FIXTURE, dir, { recursive: true });
    const archivo = path.join(dir, 'escenario.json');
    const escenario = JSON.parse(await readFile(archivo, 'utf8'));
    mutar(escenario);
    await writeFile(archivo, JSON.stringify(escenario));
    if (preparar) await preparar(dir);
    return await validarEscenario(dir, { kitDir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const codigos = (hallazgos) => hallazgos.map((h) => h.codigo);

test('el escenario mínimo es válido', async () => {
  const { errores } = await validarMutado();
  assert.deepEqual(errores, []);
});

test('una puerta hacia una sala inexistente es error', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[0].puertas[0].hacia = 'pasilo';
  });
  const hallazgo = errores.find((h) => h.codigo === 'sala-inexistente');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.donde, /puerta-siguiente/);
  assert.match(hallazgo.mensaje, /pasilo/);
});

test('un recorrido con una sala inexistente es error', async () => {
  const { errores } = await validarMutado((e) => {
    e.recorridosSugeridos[0].salas.push('azotea');
  });
  assert.ok(codigos(errores).includes('sala-inexistente'), JSON.stringify(errores));
});

test('una referencia a un mueble que no está en el catálogo es error', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[2].muebles[0].ref = 'sofa-volador';
  });
  assert.ok(codigos(errores).includes('ref-inexistente'), JSON.stringify(errores));
});

test('un arte que no existe en disco es error', async () => {
  const { errores } = await validarMutado((e) => {
    e.catalogo.muebles[0].arte = 'arte/muebles/no-existe.png';
  });
  assert.ok(codigos(errores).includes('arte-faltante'), JSON.stringify(errores));
});

test('un personaje sin portrait-triste es error', async () => {
  const kitTemporal = await mkdtemp(path.join(tmpdir(), 'kit-'));
  try {
    await cp(KIT, kitTemporal, { recursive: true });
    await rm(path.join(kitTemporal, 'persona-prueba', 'portrait-triste.png'));
    const { errores } = await validarMutado(() => {}, { kitDir: kitTemporal });
    const hallazgo = errores.find((h) => h.codigo === 'faltan-expresiones');
    assert.ok(hallazgo, JSON.stringify(errores));
    assert.match(hallazgo.mensaje, /triste/);
  } finally {
    await rm(kitTemporal, { recursive: true, force: true });
  }
});

test('un mueble con colisión sobre la entrada es error', async () => {
  const { errores } = await validarMutado((e) => {
    const sala = e.salas[0];
    sala.muebles[0].x = sala.entrada.x;
    sala.muebles[0].y = sala.entrada.y + 10;
  });
  assert.ok(codigos(errores).includes('entrada-bloqueada'), JSON.stringify(errores));
});

test('un mueble con colisión sobre una puerta es error', async () => {
  const { errores } = await validarMutado((e) => {
    const sala = e.salas[1];
    const puerta = sala.puertas[0];
    sala.muebles[0].x = puerta.x;
    sala.muebles[0].y = puerta.y;
  });
  const hallazgo = errores.find(
    (h) => h.codigo === 'entrada-bloqueada' && h.donde.includes('puerta-anterior'),
  );
  assert.ok(hallazgo, JSON.stringify(errores));
});

test('un mueble fuera de la zona caminable del encuadre es error', async () => {
  const { errores } = await validarMutado((e) => {
    const sala = e.salas.find((s) => s.encuadre === 'una-pared');
    sala.muebles[0].x = 10;
  });
  assert.ok(codigos(errores).includes('fuera-de-la-zona'), JSON.stringify(errores));
});

test('ids repetidos dentro de un mismo grupo son error', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[1].id = e.salas[0].id;
  });
  assert.ok(codigos(errores).includes('id-repetido'), JSON.stringify(errores));
});

test('completo:true con 7 salas es error', async () => {
  const quitarUltima = (e) => {
    e.salas.pop();
    e.salas[e.salas.length - 1].puertas = e.salas[e.salas.length - 1].puertas.filter(
      (p) => p.hacia !== 'sala-8',
    );
  };
  const completo = await validarMutado(quitarUltima);
  assert.ok(codigos(completo.errores).includes('pocas-salas'), JSON.stringify(completo.errores));

  const incompleto = await validarMutado((e) => {
    quitarUltima(e);
    e.completo = false;
  });
  assert.ok(!codigos(incompleto.errores).includes('pocas-salas'));
  assert.ok(codigos(incompleto.avisos).includes('pocas-salas'));
});

test('todas las salas con el mismo encuadre es aviso', async () => {
  const { errores, avisos } = await validarMutado((e) => {
    for (const sala of e.salas) sala.encuadre = 'tres-paredes';
    for (const sala of e.salas) sala.muebles[0].x = 300;
  });
  assert.deepEqual(errores, []);
  assert.ok(codigos(avisos).includes('encuadres-iguales'), JSON.stringify(avisos));
});

test('una puerta sin puerta de vuelta es aviso', async () => {
  const { errores, avisos } = await validarMutado((e) => {
    e.salas[1].puertas = e.salas[1].puertas.filter((p) => p.hacia !== 'sala-1');
  });
  assert.deepEqual(errores, []);
  const hallazgo = avisos.find((h) => h.codigo === 'puerta-sin-vuelta');
  assert.ok(hallazgo, JSON.stringify(avisos));
});

test('un tipo de objeto fuera de MAP_OBJECT_TYPES es error de esquema', async () => {
  const { errores } = await validarMutado((e) => {
    e.catalogo.objetos[0].tipo = 'CAJA';
  });
  assert.ok(codigos(errores).includes('esquema'), JSON.stringify(errores));
});

test('una puerta fuera del suelo caminable es error', async () => {
  const { errores } = await validarMutado((e) => {
    const puerta = e.salas[0].puertas[0];
    puerta.y = 100; // en medio de la pared del fondo: nadie llega caminando
  });
  const hallazgo = errores.find((h) => h.codigo === 'fuera-de-la-zona' && h.donde.includes('puerta-siguiente'));
  assert.ok(hallazgo, JSON.stringify(errores));
});

test('un fondo que no mide 960x528 es error', async () => {
  const { errores } = await validarMutado(() => {}, {
    preparar: async (dir) => {
      // Cabecera PNG mínima (firma + IHDR) de 1024x576.
      const png = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
      png.writeUInt32BE(13, 8);
      png.write('IHDR', 12, 'ascii');
      png.writeUInt32BE(1024, 16);
      png.writeUInt32BE(576, 20);
      await writeFile(path.join(dir, 'arte', 'salas', 'sala-2.png'), png);
    },
  });
  const hallazgo = errores.find((h) => h.codigo === 'arte-invalido');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /1024/);
});

test('una imagen que no es PNG es error', async () => {
  const { errores } = await validarMutado(() => {}, {
    preparar: (dir) => writeFile(path.join(dir, 'arte', 'muebles', 'mesa.png'), ''),
  });
  assert.ok(codigos(errores).includes('arte-invalido'), JSON.stringify(errores));
});

test('el CLI sale con 0, 1 o 2 aunque se llame a través de un enlace de carpeta', async () => {
  const enlaces = await mkdtemp(path.join(tmpdir(), 'enlace-'));
  const roto = await mkdtemp(path.join(tmpdir(), 'roto-'));
  try {
    const enlace = path.join(enlaces, 'scripts');
    await symlink(aqui, enlace, 'junction');
    const cli = (...args) => spawnSync(process.execPath, [path.join(enlace, 'validar.mjs'), ...args], { encoding: 'utf8' });

    const bien = cli(FIXTURE, '--kit', KIT);
    assert.equal(bien.status, 0, bien.stdout + bien.stderr);

    await writeFile(path.join(roto, 'escenario.json'), '{ "esquema": 1 }');
    const mal = cli(roto, '--kit', KIT);
    assert.equal(mal.status, 1, mal.stdout + mal.stderr);
    assert.match(mal.stdout, /^ERROR esquema /m);

    assert.equal(cli().status, 2);
  } finally {
    await rm(enlaces, { recursive: true, force: true });
    await rm(roto, { recursive: true, force: true });
  }
});

test('zonaCaminable devuelve los valores fijados', () => {
  assert.deepEqual(zonaCaminable('tres-paredes'), { x: 96, y: 236, ancho: 768, alto: 250 });
  assert.deepEqual(zonaCaminable('dos-paredes-izquierda'), { x: 96, y: 236, ancho: 840, alto: 250 });
  assert.deepEqual(zonaCaminable('dos-paredes-derecha'), { x: 24, y: 236, ancho: 840, alto: 250 });
  assert.deepEqual(zonaCaminable('una-pared'), { x: 24, y: 236, ancho: 912, alto: 250 });
});
