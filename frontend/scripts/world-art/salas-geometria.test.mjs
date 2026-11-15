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

test('redondearPy redondea al par en el medio exacto, como round() de Python', () => {
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999, 2.5001, 7].map(g.redondearPy), [0, 2, 2, 0, -2, 2, 3, 7]);
});

test('un ancho fuera del catálogo se rechaza', () => {
  assert.equal(g.esAncho(1200), true);
  assert.equal(g.esAncho(1000), false);
  assert.throws(() => g.borde(1000), /fuera del catálogo/);
});
