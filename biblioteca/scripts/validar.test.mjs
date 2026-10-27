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

test('una sala a la que no se llega por ninguna puerta es aviso', async () => {
  const { errores, avisos } = await validarMutado((e) => {
    e.salas[6].puertas = e.salas[6].puertas.filter((p) => p.hacia !== 'sala-8');
    e.salas[7].puertas = [];
  });
  assert.deepEqual(errores, []);
  const hallazgo = avisos.find((h) => h.codigo === 'sala-inalcanzable');
  assert.ok(hallazgo, JSON.stringify(avisos));
  assert.match(hallazgo.donde, /sala-8/);
});

test('una puerta que lleva a su misma sala es error', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[0].puertas[0].hacia = 'sala-1';
  });
  assert.ok(codigos(errores).includes('puerta-a-si-misma'), JSON.stringify(errores));
});

test('los mensajes del esquema van en español llano', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[0].entrada.x = 'centro';
    e.salas[1].id = 'Sala Dos';
  });
  const tipo = errores.find((h) => h.donde.includes('entrada'));
  assert.ok(tipo, JSON.stringify(errores));
  assert.doesNotMatch(tipo.mensaje, /integer|object|string/);
  assert.match(tipo.mensaje, /número entero/);
  const clave = errores.find((h) => /salas\[1\].* › id$/.test(h.donde));
  assert.ok(clave, JSON.stringify(errores));
  assert.doesNotMatch(clave.mensaje, /arte/);
});

test('un nombre de solo espacios es error de esquema', async () => {
  const { errores } = await validarMutado((e) => {
    e.salas[0].nombre = '   ';
  });
  assert.ok(codigos(errores).includes('esquema'), JSON.stringify(errores));
});

test('--kit sin carpeta es un error de uso', () => {
  const r = spawnSync(process.execPath, [path.join(aqui, 'validar.mjs'), FIXTURE, '--kit'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test('zonaCaminable devuelve los valores fijados', () => {
  assert.deepEqual(zonaCaminable('tres-paredes'), { x: 96, y: 236, ancho: 768, alto: 250 });
  assert.deepEqual(zonaCaminable('dos-paredes-izquierda'), { x: 96, y: 236, ancho: 840, alto: 250 });
  assert.deepEqual(zonaCaminable('dos-paredes-derecha'), { x: 24, y: 236, ancho: 840, alto: 250 });
  assert.deepEqual(zonaCaminable('una-pared'), { x: 24, y: 236, ancho: 912, alto: 250 });
});

test('una hoja de cercanía que no existe es error arte-faltante', async () => {
  const r = await validarMutado((e) => {
    e.catalogo.objetos[0].animacionCerca = { hoja: 'arte/objetos/folleto-cerca.png', cuadros: 3, fps: 6 };
  });
  assert.ok(r.errores.some((x) => x.codigo === 'arte-faltante' && x.mensaje.includes('folleto-cerca')));
});

test('una hoja de cercanía con medida que no cuadra es error hoja-medida', async () => {
  const r = await validarMutado(
    (e) => { e.catalogo.objetos[0].animacionCerca = { hoja: 'arte/objetos/folleto.png', cuadros: 3, fps: 6 }; },
  );
  assert.ok(r.errores.some((x) => x.codigo === 'hoja-medida'));
});

// ── Esquema 2: hitos, nivel de riesgo, modelos compartidos y seis caras ──

test('un lugar de esquema 2 sin hitos es error de esquema', async () => {
  const { errores } = await validarMutado((e) => {
    delete e.hitos;
  });
  const hallazgo = errores.find((h) => h.codigo === 'esquema');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /hitos/);
});

test('un hito con decisive que no es booleano es error de esquema', async () => {
  const { errores } = await validarMutado((e) => {
    e.hitos[0].decisive = 'sí';
  });
  const hallazgo = errores.find((h) => h.codigo === 'esquema' && h.donde.includes('hitos'));
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /verdadero o falso/);
});

test('nivelRiesgoPorDefecto fuera del vocabulario es error de esquema', async () => {
  const { errores } = await validarMutado((e) => {
    e.nivelRiesgoPorDefecto = 'ALTO';
  });
  const hallazgo = errores.find((h) => h.codigo === 'esquema' && h.donde.includes('nivelRiesgoPorDefecto'));
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /VARIABLE, MODERATE, SEVERE, EXTREME/);
});

test('desdeModelo junto con arte es error desde-modelo-ambiguo', async () => {
  const { errores } = await validarMutado((e) => {
    e.catalogo.objetos[0].desdeModelo = 'televisor';
  });
  const hallazgo = errores.find((h) => h.codigo === 'desde-modelo-ambiguo');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.donde, /folleto/);
});

test('desdeModelo con un id que no está en biblioteca/modelos/catalogo.json es error modelo-inexistente', async () => {
  const { errores } = await validarMutado((e) => {
    e.catalogo.objetos[0] = { id: 'folleto', nombre: 'Folleto', tipo: 'RESOURCE', desdeModelo: 'televisr' };
  });
  const hallazgo = errores.find((h) => h.codigo === 'modelo-inexistente');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /televisr/);
});

test('desdeModelo sin aplicar todavía no es error: es aviso modelo-sin-aplicar', async () => {
  const { errores, avisos } = await validarMutado((e) => {
    e.catalogo.objetos[0] = { id: 'folleto', nombre: 'Folleto', tipo: 'RESOURCE', desdeModelo: 'televisor' };
  });
  assert.deepEqual(errores, []);
  assert.ok(codigos(avisos).includes('modelo-sin-aplicar'), JSON.stringify(avisos));
});

test('un personaje sin portrait-cautelosa es error faltan-expresiones', async () => {
  const kitTemporal = await mkdtemp(path.join(tmpdir(), 'kit-'));
  try {
    await cp(KIT, kitTemporal, { recursive: true });
    await rm(path.join(kitTemporal, 'persona-prueba', 'portrait-cautelosa.png'));
    await rm(path.join(kitTemporal, 'persona-prueba', 'portrait-en-crisis.png'));
    const { errores } = await validarMutado(() => {}, { kitDir: kitTemporal });
    const hallazgo = errores.find((h) => h.codigo === 'faltan-expresiones');
    assert.ok(hallazgo, JSON.stringify(errores));
    assert.match(hallazgo.mensaje, /cautelosa, en-crisis/);
  } finally {
    await rm(kitTemporal, { recursive: true, force: true });
  }
});

test('un lugar de esquema 1 valida con aviso esquema-antiguo', async () => {
  const { errores, avisos } = await validarMutado((e) => {
    e.esquema = 1;
    delete e.hitos;
    delete e.nivelRiesgoPorDefecto;
  });
  assert.deepEqual(errores, []);
  assert.ok(codigos(avisos).includes('esquema-antiguo'), JSON.stringify(avisos));
});

// ── Los tres lugares a la vez: índice y --todos ──

import { validarTodos } from './validar.mjs';

/** Carpeta temporal con escenarios/<id> copiados del fixture mínimo y un indice.json. */
async function bibliotecaTemporal(indice, ids = ['minimo']) {
  const dir = await mkdtemp(path.join(tmpdir(), 'escenarios-'));
  for (const id of ids) {
    await cp(FIXTURE, path.join(dir, id), { recursive: true });
    const archivo = path.join(dir, id, 'escenario.json');
    const e = JSON.parse(await readFile(archivo, 'utf8'));
    e.id = id;
    await writeFile(archivo, JSON.stringify(e));
  }
  await writeFile(path.join(dir, 'indice.json'), JSON.stringify(indice));
  return dir;
}

const entradaMinimo = (extra = {}) => ({
  id: 'minimo', nombre: 'Lugar mínimo', salas: 8, completo: true, arteProvisional: true, temas: ['prueba'], hitos: 2, ...extra,
});

test('--todos valida los lugares del índice y pasa con el fixture', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo()] });
  try {
    const { errores, lugares } = await validarTodos(dir, { kitDir: KIT });
    assert.deepEqual(errores, []);
    assert.deepEqual(lugares, ['minimo']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--todos falla si el índice nombra un lugar que no existe', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo(), entradaMinimo({ id: 'hospital', nombre: 'Hospital' })] });
  try {
    const { errores } = await validarTodos(dir, { kitDir: KIT });
    const hallazgo = errores.find((h) => h.codigo === 'indice-lugar-inexistente');
    assert.ok(hallazgo, JSON.stringify(errores));
    assert.match(hallazgo.mensaje, /hospital/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--todos falla si salas no coincide', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo({ salas: 9 })] });
  try {
    const { errores } = await validarTodos(dir, { kitDir: KIT });
    const hallazgo = errores.find((h) => h.codigo === 'indice-no-coincide');
    assert.ok(hallazgo, JSON.stringify(errores));
    assert.match(hallazgo.mensaje, /salas/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--todos avisa de un lugar en disco que el índice no nombra', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo()] }, ['minimo', 'extra']);
  try {
    const { avisos } = await validarTodos(dir, { kitDir: KIT });
    assert.ok(avisos.some((h) => h.codigo === 'indice-falta-lugar' && h.mensaje.includes('extra')), JSON.stringify(avisos));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── Pase de arreglos de la revisión final ──

test('--todos reporta un escenario.json roto como error, sin excepción', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo()] });
  try {
    await writeFile(path.join(dir, 'minimo', 'escenario.json'), '{ "esquema": 2, ');
    const { errores } = await validarTodos(dir, { kitDir: KIT });
    assert.ok(errores.some((h) => h.codigo === 'esquema' && h.donde.includes('minimo')), JSON.stringify(errores));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--todos reporta una entrada del índice sin id como error indice', async () => {
  const dir = await bibliotecaTemporal({ esquema: 1, lugares: [entradaMinimo(), { nombre: 'Sin id' }, null] });
  try {
    const { errores, lugares } = await validarTodos(dir, { kitDir: KIT });
    assert.equal(errores.filter((h) => h.codigo === 'indice').length, 2, JSON.stringify(errores));
    assert.deepEqual(lugares, ['minimo']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('una pieza desdeModelo a medio resolver es error modelo-incompleto', async () => {
  const { errores } = await validarMutado((e) => {
    e.catalogo.objetos[0] = { id: 'folleto', nombre: 'Folleto', tipo: 'PROP', desdeModelo: 'televisor', arte: 'arte/objetos/televisor.png' };
  });
  const hallazgo = errores.find((h) => h.codigo === 'modelo-incompleto');
  assert.ok(hallazgo, JSON.stringify(errores));
  assert.match(hallazgo.mensaje, /animacionCerca/);
});

test('dos hitos con la misma key son error id-repetido', async () => {
  const { errores } = await validarMutado((e) => {
    e.hitos.push({ ...e.hitos[0] });
  });
  const hallazgo = errores.find((h) => h.codigo === 'id-repetido' && h.donde.includes('hito'));
  assert.ok(hallazgo, JSON.stringify(errores));
});
