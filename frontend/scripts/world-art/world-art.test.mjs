/**
 * Arte del mundo a su tamaño exacto (F8, spec §13.1): los PNG de muebles, puertas y objetos miden lo
 * que dice WORLD_SPRITES, están recortados al cuerpo opaco, tienen alfa binario y pocos colores, no
 * sobra ninguno, son la salida del build (npm run world-art:build) y el inventario cuenta la verdad.
 * Así se dibujan a escala 1 sin mezclar píxeles.
 *
 * El arte de la biblioteca (lugares, modelos y existentes animados) no pasa por WORLD_SPRITES: entra por
 * `biblioteca/manifiesto.json` (P6), y cada entrada se valida aquí (existe, mide lo que dice, alfa binario,
 * a lo sumo MAX_COLORS colores, hoja = cuadros × ancho). Angular solo publica assets dentro de frontend/, así que el
 * build copia esos PNG y el manifiesto a `src/assets/biblioteca/` (se sirven en /assets/biblioteca/...) y aquí se
 * comprueba que la copia es idéntica a la biblioteca.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { FRONTEND_ROOT, MAX_COLORS, buildWorldArt, manifestFindings, publishLibrary, publishedFindings, readManifest, readPng, writePng } from './build.mjs';
import { boundsOf, paletteOf, rescaleSprite } from './rescale.mjs';

export { MAX_COLORS };
const GROUPS = ['furniture', 'doors', 'objects'];

export function worldArtFindings(root = FRONTEND_ROOT, sprites = WORLD_SPRITES) {
  const findings = [];
  const assets = path.join(root, 'src', 'assets', 'game');
  for (const spec of sprites) {
    const label = `${spec.group}/${spec.name}.png`;
    if (!existsSync(path.join(root, 'world-art', 'originals', spec.group, `${spec.name}.png`))) {
      findings.push(`${label}: falta el original en world-art/originals`);
    }
    const file = path.join(assets, spec.group, `${spec.name}.png`);
    if (!existsSync(file)) {
      findings.push(`${label}: no existe`);
      continue;
    }
    const image = readPng(file);
    if (image.width !== spec.width || image.height !== spec.height) {
      findings.push(`${label}: mide ${image.width}×${image.height} y la tabla dice ${spec.width}×${spec.height}`);
    }
    let binary = true;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0 && image.data[i] !== 255) binary = false;
    if (!binary) findings.push(`${label}: el alfa no es binario`);
    const bounds = boundsOf(image);
    if (!bounds || bounds.width !== image.width || bounds.height !== image.height) findings.push(`${label}: no está recortado al cuerpo opaco`);
    const colors = paletteOf(image).size;
    if (colors > MAX_COLORS) findings.push(`${label}: usa ${colors} colores (máximo ${MAX_COLORS})`);
    const original = path.join(root, 'world-art', 'originals', spec.group, `${spec.name}.png`);
    if (image.width === spec.width && image.height === spec.height && existsSync(original)) {
      // La salida es lo que genera el build: si no, un original cambiado no llega al juego o un retoque a mano se pierde.
      try {
        const expected = rescaleSprite(readPng(original), spec.width, spec.height);
        if (Buffer.compare(Buffer.from(expected.data), Buffer.from(image.data)) !== 0) findings.push(`${label}: no es la salida del build (npm run world-art:build)`);
      } catch (error) {
        findings.push(`${label}: el original no se puede reescalar (${error.message})`);
      }
    }
  }
  for (const group of GROUPS) {
    const dir = path.join(assets, group);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(name => name.endsWith('.png'))) {
      if (!sprites.some(spec => spec.group === group && `${spec.name}.png` === file)) findings.push(`${group}/${file}: no está en WORLD_SPRITES`);
    }
  }
  const inventoryFile = path.join(root, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');
  if (existsSync(inventoryFile)) {
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
    for (const spec of sprites) {
      const entry = inventory.assets.find(asset => asset.src === `game/${spec.group}/${spec.name}.png`);
      if (!entry) {
        findings.push(`inventario: no lista ${spec.group}/${spec.name}.png`);
        continue;
      }
      const { width, height } = entry.expectedDimensions ?? {};
      if (width !== spec.width || height !== spec.height) {
        findings.push(`inventario: ${entry.assetId} dice ${width}×${height} y la tabla ${spec.width}×${spec.height}`);
      }
      if (entry.logicalScale !== 1) findings.push(`inventario: ${entry.assetId} no está a escala lógica 1`);
    }
  }
  return findings;
}

test('el arte del mundo está a su tamaño exacto (spec §13.1, decisión 12)', () => {
  assert.deepEqual(worldArtFindings(), []);
});

test('el detector ve un PNG de otro tamaño, con alfa parcial y sin recortar, un huérfano y un inventario falso', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-contrato-'));
  try {
    const spec = { group: 'furniture', name: 'mesa', width: 2, height: 2 };
    const original = { width: 2, height: 2, data: new Uint8Array(16).fill(255) };
    writePng(path.join(root, 'world-art', 'originals', 'furniture', 'mesa.png'), original);
    // 3×3 con un píxel semitransparente y la última fila vacía
    const bad = { width: 3, height: 3, data: new Uint8Array(36) };
    bad.data.set([200, 40, 40, 255, 200, 40, 40, 128, 200, 40, 40, 255], 0);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'mesa.png'), bad);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'sobra.png'), original);
    const inventory = path.join(root, 'src', 'assets', 'visual', 'v1');
    mkdirSync(inventory, { recursive: true });
    writeFileSync(path.join(inventory, 'inventory.v1.json'), JSON.stringify({
      assets: [{ assetId: 'furniture-mesa', src: 'game/furniture/mesa.png', expectedDimensions: { width: 9, height: 9 }, logicalScale: 2 }],
    }));
    assert.deepEqual(worldArtFindings(root, [spec]), [
      'furniture/mesa.png: mide 3×3 y la tabla dice 2×2',
      'furniture/mesa.png: el alfa no es binario',
      'furniture/mesa.png: no está recortado al cuerpo opaco',
      'furniture/sobra.png: no está en WORLD_SPRITES',
      'inventario: furniture-mesa dice 9×9 y la tabla 2×2',
      'inventario: furniture-mesa no está a escala lógica 1',
    ]);
    rmSync(path.join(root, 'world-art'), { recursive: true });
    assert.ok(worldArtFindings(root, [spec]).includes('furniture/mesa.png: falta el original en world-art/originals'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el detector acepta la salida del build y ve un PNG válido que ya no lo es (original cambiado o salida retocada)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-al-dia-'));
  try {
    const spec = { group: 'furniture', name: 'mesa', width: 2, height: 2 };
    const originals = path.join(root, 'world-art', 'originals');
    const output = path.join(root, 'src', 'assets', 'game');
    // original de 4×4 en dos mitades de color: su reescalado a 2×2 es determinista
    const original = { width: 4, height: 4, data: new Uint8Array(64) };
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) original.data.set(x < 2 ? [200, 40, 40, 255] : [40, 80, 200, 255], (y * 4 + x) * 4);
    }
    writePng(path.join(originals, 'furniture', 'mesa.png'), original);
    buildWorldArt({ originals, output, sprites: [spec] });
    assert.deepEqual(worldArtFindings(root, [spec]), []);

    // un retoque a mano de la salida cumple tamaño, alfa, recorte y paleta, pero el próximo build lo borraría
    const file = path.join(output, 'furniture', 'mesa.png');
    const retouched = readPng(file);
    retouched.data.set([40, 80, 200, 255], 0);
    writePng(file, retouched);
    assert.deepEqual(worldArtFindings(root, [spec]), ['furniture/mesa.png: no es la salida del build (npm run world-art:build)']);

    // un original cambiado sin volver a correr el build: el juego seguiría mostrando el arte viejo
    buildWorldArt({ originals, output, sprites: [spec] });
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) original.data.set([10, 200, 10, 255], (y * 4 + x) * 4);
    writePng(path.join(originals, 'furniture', 'mesa.png'), original);
    assert.deepEqual(worldArtFindings(root, [spec]), ['furniture/mesa.png: no es la salida del build (npm run world-art:build)']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Una biblioteca de juguete: un modelo con hoja de cercanía de 3 cuadros y un fondo de sala. */
function solid(width, height, color = [200, 40, 40, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

function toyLibrary(root) {
  writePng(path.join(root, 'modelos', 'arte', 'taza.png'), solid(10, 12));
  writePng(path.join(root, 'modelos', 'arte', 'taza-cerca.png'), solid(30, 12));
  writePng(path.join(root, 'escenarios', 'casa', 'arte', 'salas', 'sala.png'), solid(16, 8));
  const manifest = {
    esquema: 1,
    sprites: {
      'escenarios/casa/arte/salas/sala.png': { alto: 8, ancho: 16, origen: 'lugar' },
      'modelos/arte/taza-cerca.png': { alto: 12, ancho: 10, cuadros: 3, fps: 6, origen: 'modelo' },
      'modelos/arte/taza.png': { alto: 12, ancho: 10, origen: 'modelo' },
    },
  };
  writeFileSync(path.join(root, 'manifiesto.json'), JSON.stringify(manifest));
  return manifest;
}

test('el manifiesto de la biblioteca es verdad: cada entrada existe, mide lo que dice, alfa binario, ≤ 40 colores y hoja = cuadros × ancho', () => {
  const manifest = readManifest();
  assert.equal(manifest.esquema, 1);
  assert.ok(Object.keys(manifest.sprites).length >= 258);
  assert.deepEqual(manifestFindings(), []);
});

test('el detector del manifiesto acepta una biblioteca al día', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manifiesto-al-dia-'));
  try {
    toyLibrary(root);
    assert.deepEqual(manifestFindings({ biblioteca: root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el detector del manifiesto ve un PNG ausente, de otra medida, con alfa parcial, con demasiados colores, una hoja que no es cuadros × ancho y un PNG sin listar', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manifiesto-mal-'));
  try {
    const manifest = toyLibrary(root);
    // el reposo mide 11×12 y el manifiesto dice 10×12
    writePng(path.join(root, 'modelos', 'arte', 'taza.png'), solid(11, 12));
    // la hoja mide 31 y el manifiesto dice 3 cuadros de 10
    writePng(path.join(root, 'modelos', 'arte', 'taza-cerca.png'), solid(31, 12));
    // el fondo tiene un píxel semitransparente y 41 colores distintos
    const fondo = solid(16, 8);
    fondo.data[3] = 128;
    for (let i = 0; i < 41; i++) fondo.data.set([i * 5, 10, 10, 255], (i + 1) * 4);
    writePng(path.join(root, 'escenarios', 'casa', 'arte', 'salas', 'sala.png'), fondo);
    // un PNG de arte que el manifiesto no lista (las hojas de contacto no cuentan)
    writePng(path.join(root, 'modelos', 'arte', 'sobra.png'), solid(4, 4));
    writePng(path.join(root, 'modelos', 'hoja-contacto.png'), solid(4, 4));
    // una entrada sin archivo, una con cuadros sin fps y un origen inventado
    manifest.sprites['modelos/arte/fantasma.png'] = { alto: 4, ancho: 4, origen: 'modelo' };
    manifest.sprites['modelos/arte/taza.png'].cuadros = 2;
    manifest.sprites['escenarios/casa/arte/salas/sala.png'].origen = 'cielo';
    writeFileSync(path.join(root, 'manifiesto.json'), JSON.stringify(manifest));
    assert.deepEqual(manifestFindings({ biblioteca: root }), [
      'escenarios/casa/arte/salas/sala.png: origen «cielo» no es modelo, lugar ni existente',
      'escenarios/casa/arte/salas/sala.png: el alfa no es binario',
      'escenarios/casa/arte/salas/sala.png: usa 42 colores (máximo 40)',
      'modelos/arte/fantasma.png: no existe',
      'modelos/arte/taza-cerca.png: mide 31×12 y el manifiesto dice 30×12 (3 cuadros de 10)',
      'modelos/arte/taza.png: cuadros y fps van juntos',
      'modelos/arte/taza.png: mide 11×12 y el manifiesto dice 20×12 (2 cuadros de 10)',
      'modelos/arte/sobra.png: no está en biblioteca/manifiesto.json (python tools/escenarios/manifiesto.py)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('la copia publicada en src/assets/biblioteca es idéntica a la biblioteca (npm run world-art:build)', () => {
  assert.deepEqual(publishedFindings(), []);
});

test('publishLibrary copia el manifiesto y sus PNG, borra lo que sobra y publishedFindings ve cualquier diferencia', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manifiesto-publicar-'));
  try {
    const biblioteca = path.join(root, 'biblioteca');
    const output = path.join(root, 'assets', 'biblioteca');
    toyLibrary(biblioteca);
    // lo que no es arte del juego no se publica
    writePng(path.join(biblioteca, 'modelos', 'hoja-contacto.png'), solid(4, 4));
    // una copia vieja con un huérfano
    writePng(path.join(output, 'modelos', 'arte', 'viejo.png'), solid(2, 2));
    assert.ok(publishedFindings({ biblioteca, output }).length > 0);

    const copied = publishLibrary({ biblioteca, output });
    assert.equal(copied, 4); // 3 PNG y el manifiesto
    assert.deepEqual(publishedFindings({ biblioteca, output }), []);
    assert.ok(existsSync(path.join(output, 'manifiesto.json')));
    assert.ok(!existsSync(path.join(output, 'modelos', 'arte', 'viejo.png')));
    assert.ok(!existsSync(path.join(output, 'modelos', 'hoja-contacto.png')));

    // un retoque a mano de la copia, un PNG que falta y un huérfano
    writePng(path.join(output, 'modelos', 'arte', 'taza.png'), solid(10, 12, [1, 2, 3, 255]));
    rmSync(path.join(output, 'modelos', 'arte', 'taza-cerca.png'));
    writePng(path.join(output, 'modelos', 'arte', 'sobra.png'), solid(2, 2));
    assert.deepEqual(publishedFindings({ biblioteca, output }), [
      'modelos/arte/taza-cerca.png: falta en src/assets/biblioteca (npm run world-art:build)',
      'modelos/arte/taza.png: la copia en src/assets/biblioteca no es igual a la biblioteca (npm run world-art:build)',
      'modelos/arte/sobra.png: sobra en src/assets/biblioteca (npm run world-art:build)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publishLibrary publica también el catálogo de piezas: su manifiesto, cada imagen que nombra y los lugares, sin la referencia de luz', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manifiesto-piezas-'));
  try {
    const biblioteca = path.join(root, 'biblioteca');
    const output = path.join(root, 'assets', 'biblioteca');
    toyLibrary(biblioteca);
    const piezas = path.join(biblioteca, 'piezas');
    writePng(path.join(piezas, 'pisos', 'vinilo-a.png'), solid(4, 2));
    writePng(path.join(piezas, 'puertas', 'madera-frente.png'), solid(8, 6));
    writePng(path.join(piezas, 'luz', 'referencia', 'casa-sala-dia-ambiente.png'), solid(2, 2));
    writePng(path.join(piezas, 'sin-usar.png'), solid(2, 2));
    mkdirSync(path.join(piezas, 'lugares'), { recursive: true });
    writeFileSync(path.join(piezas, 'lugares', 'hospital.json'), '{"esquema":3,"salas":[]}');
    writeFileSync(path.join(piezas, 'manifiesto.json'), JSON.stringify({
      esquema: 2, lugares: ['piezas/lugares/hospital.json'], pisos: { 'vinilo-a': { ruta: 'piezas/pisos/vinilo-a.png' } },
      piezas: { 'puerta/madera': { vistas: { frente: { ruta: 'piezas/puertas/madera-frente.png' } } } },
      luz: { casos: 'piezas/luz/casos.json', referencia: 'piezas/luz/LEEME.md' },
    }));

    assert.equal(publishLibrary({ biblioteca, output }), 8); // 3 PNG y el manifiesto general; 2 imágenes, un lugar y el manifiesto de piezas
    assert.deepEqual(publishedFindings({ biblioteca, output }), []);
    for (const key of ['piezas/manifiesto.json', 'piezas/pisos/vinilo-a.png', 'piezas/puertas/madera-frente.png', 'piezas/lugares/hospital.json']) {
      assert.ok(existsSync(path.join(output, ...key.split('/'))), key);
    }
    assert.ok(!existsSync(path.join(output, 'piezas', 'sin-usar.png')), 'lo que el manifiesto no nombra no se publica');
    assert.ok(!existsSync(path.join(output, 'piezas', 'luz')), 'la referencia de luz es de las pruebas, no del juego');

    // Una pieza que P1 regeneró y no se volvió a publicar se nota.
    writePng(path.join(piezas, 'pisos', 'vinilo-a.png'), solid(4, 2, [9, 9, 9, 255]));
    assert.deepEqual(publishedFindings({ biblioteca, output }),
      ['piezas/pisos/vinilo-a.png: la copia en src/assets/biblioteca no es igual a la biblioteca (npm run world-art:build)']);
    // Un manifiesto de piezas que nombra una imagen que no existe falla antes de borrar nada.
    rmSync(path.join(piezas, 'puertas', 'madera-frente.png'));
    assert.throws(() => publishLibrary({ biblioteca, output }), /publishLibrary: .*madera-frente/);
    assert.ok(existsSync(path.join(output, 'piezas', 'puertas', 'madera-frente.png')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Revisión final · C7: la salida nunca puede ser la propia biblioteca (publicar borra la carpeta de salida antes de copiar).
test('publishLibrary se niega si la salida es la biblioteca, está dentro de ella o la contiene, y no borra nada', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manifiesto-salida-'));
  try {
    const biblioteca = path.join(root, 'biblioteca');
    toyLibrary(biblioteca);
    const antes = readFileSync(path.join(biblioteca, 'manifiesto.json'), 'utf8');
    // `biblioteca` también se llama «biblioteca»: el nombre de la carpeta no basta como guarda.
    for (const output of [biblioteca, path.join(biblioteca, 'biblioteca'), path.join(biblioteca, '..', 'biblioteca'), path.join(biblioteca, 'modelos', '..')]) {
      assert.throws(() => publishLibrary({ biblioteca, output }), /publishLibrary: la salida/, output);
    }
    // La que contiene a la biblioteca (borrarla se llevaría la fuente) tampoco.
    const contenedora = path.join(root, 'x', 'biblioteca');
    mkdirSync(contenedora, { recursive: true });
    const dentro = path.join(contenedora, 'dentro');
    toyLibrary(dentro);
    assert.throws(() => publishLibrary({ biblioteca: dentro, output: contenedora }), /publishLibrary: la salida/);
    assert.ok(existsSync(path.join(dentro, 'manifiesto.json')), 'la biblioteca fuente sigue donde estaba');
    // La biblioteca fuente quedó intacta.
    assert.equal(readFileSync(path.join(biblioteca, 'manifiesto.json'), 'utf8'), antes);
    assert.ok(existsSync(path.join(biblioteca, 'modelos', 'arte', 'taza.png')));
    // Un manifiesto que lista un PNG inexistente falla ANTES de borrar la copia vieja.
    const output = path.join(root, 'assets', 'biblioteca');
    writePng(path.join(output, 'modelos', 'arte', 'viejo.png'), solid(2, 2));
    const manifest = JSON.parse(antes);
    manifest.sprites['modelos/arte/fantasma.png'] = { alto: 4, ancho: 4, origen: 'modelo' };
    writeFileSync(path.join(biblioteca, 'manifiesto.json'), JSON.stringify(manifest));
    assert.throws(() => publishLibrary({ biblioteca, output }), /publishLibrary: .*fantasma/);
    assert.ok(existsSync(path.join(output, 'modelos', 'arte', 'viejo.png')), 'la copia anterior sigue ahí: se validó antes de borrar');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
