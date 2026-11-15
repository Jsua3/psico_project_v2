// Paridad de la geometría de las salas por piezas: `sala/geometria.ts` debe dar lo mismo que `tools/escenarios/piezas_geo.py`.
// La referencia sale de `python tools/escenarios/piezas_referencia.py`.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const REF = JSON.parse(readFileSync(new URL('./fixtures/salas-referencia.json', import.meta.url), 'utf8')).geometria;
const g = await import('../../src/app/features/simulator/sala/geometria.ts');

test('las constantes de la sala son las de Python', () => {
  const c = REF.constantes;
  assert.deepEqual([g.ALTO, g.SEAM, g.TOP, g.FONDO, g.ALTO_MURO, g.MARGEN, g.REJILLA], [c.alto, c.piso, c.tope, c.fondo, c.altoMuro, c.margen, c.rejilla]);
  assert.deepEqual([...g.ANCHOS], c.anchos);
  assert.equal(g.ANCHO_MAESTRA, c.maestra);
  assert.equal(g.ALTO_MAESTRA_MURO, c.altoMaestraMuro);
});

test('borde, límites, zona caminable y recorte coinciden en cada encuadre y ancho', () => {
  for (const caso of REF.casos) {
    const donde = `${caso.encuadre} a ${caso.ancho}`;
    assert.equal(g.borde(caso.ancho), caso.borde, donde);
    assert.deepEqual(g.laterales(caso.encuadre), caso.laterales, donde);
    assert.deepEqual(g.limites(caso.encuadre, caso.ancho), caso.limites, donde);
    assert.deepEqual(g.zonaCaminable(caso.encuadre, caso.ancho), caso.zona, donde);
    assert.deepEqual(g.recorteDeMaestra(caso.ancho), caso.recorte, donde);
    for (const [muro, ref] of Object.entries(caso.muros)) assert.equal(g.largoMuro(muro, caso.encuadre, caso.ancho), ref.largo, `${donde}, ${muro}`);
  }
});

test('el punto de apoyo y la llegada coinciden en todas las posiciones enteras de cada muro', () => {
  for (const caso of REF.casos) {
    for (const [muro, ref] of Object.entries(caso.muros)) {
      if (!ref.largo) continue;
      const donde = `${caso.encuadre} a ${caso.ancho}, muro ${muro}`;
      // La muestra primero: si algo difiere, dice en qué posición.
      for (const [pos, x, y, lx, ly] of ref.muestra) {
        assert.deepEqual(g.enPantalla(muro, pos, caso.encuadre, caso.ancho), [x, y], `${donde}, pos ${pos}: apoyo`);
        assert.deepEqual(g.llegada(muro, pos, caso.encuadre, caso.ancho), [lx, ly], `${donde}, pos ${pos}: llegada`);
      }
      let texto = '';
      for (let pos = 0; pos <= ref.largo; pos++) {
        const [x, y] = g.enPantalla(muro, pos, caso.encuadre, caso.ancho);
        const [lx, ly] = g.llegada(muro, pos, caso.encuadre, caso.ancho);
        texto += `${x},${y},${lx},${ly};`;
      }
      assert.equal(createHash('sha256').update(texto, 'ascii').digest('hex'), ref.huella, donde);
    }
  }
});

test('redondear lleva las mitades hacia arriba, como pide el contrato 2.2', () => {
  assert.deepEqual([[1, 2], [3, 2], [5, 2], [-1, 2], [-3, 2], [7, 3], [8, 3], [-7, 3]].map(([n, d]) => g.redondear(n, d)), [1, 2, 3, 0, -1, 2, 3, -2]);
});

test('umbral y ancla de los ejemplos del contrato 2.2 (secciones 7 y 8)', () => {
  // Sala de espera del hospital, 1440, tres paredes.
  assert.deepEqual(g.enPantalla('izquierda', 176, 'tres-paredes', 1440), [69, 406]);
  assert.deepEqual(g.llegada('izquierda', 176, 'tres-paredes', 1440), [150, 406]);
  assert.deepEqual(g.llegada('fondo', 1136, 'tres-paredes', 1440), [1270, 260]);
  assert.deepEqual(g.enPantalla('camara', 584, 'tres-paredes', 1440), [718, 528]);
  assert.deepEqual(g.llegada('camara', 584, 'tres-paredes', 1440), [718, 476]);
  // Pasillo del hospital, 1680: la tabla de la sección 8.2.
  const pasillo = [['fondo', 160, [313, 230], [313, 260]], ['izquierda', 160, [84, 390], [169, 390]],
    ['derecha', 160, [1596, 390], [1511, 390]], ['camara', 344, [433, 528], [433, 476]], ['camara', 1032, [1250, 528], [1250, 476]]];
  for (const [muro, pos, ancla, umbral] of pasillo) {
    assert.deepEqual(g.enPantalla(muro, pos, 'tres-paredes', 1680), ancla, `${muro} ${pos}: ancla`);
    assert.deepEqual(g.llegada(muro, pos, 'tres-paredes', 1680), umbral, `${muro} ${pos}: umbral`);
  }
});

test('un ancho fuera del catálogo se rechaza', () => {
  assert.equal(g.esAncho(1200), true);
  assert.equal(g.esAncho(1000), false);
  assert.throws(() => g.borde(1000), /fuera del catálogo/);
});
