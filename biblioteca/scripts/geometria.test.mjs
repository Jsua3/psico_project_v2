// La copia del validador reproduce la tabla dorada del servidor en todos los anchos (contrato x-siep 2.2, §1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ANCHOS, ancla, borde, largoMuro, limites, llegada, paredes, zonaCaminable } from './geometria.mjs';

const tabla = JSON.parse(readFileSync(new URL('../esquema/geometria-salas.json', import.meta.url), 'utf8'));

test('declara los mismos anchos que el servidor', () => {
  assert.deepEqual([...ANCHOS], tabla.anchos);
});

test('rechaza un ancho fuera del catálogo', () => {
  assert.throws(() => borde(1000));
});

for (const sala of tabla.salas) {
  test(`coincide con la tabla dorada en ${sala.encuadre} a ${sala.ancho} px`, () => {
    const { ancho, encuadre } = sala;
    assert.equal(borde(ancho), sala.borde);
    const z = zonaCaminable(encuadre, ancho);
    assert.deepEqual([z.x, z.y, z.ancho, z.alto], sala.zona);
    assert.deepEqual(limites(encuadre, ancho), sala.limites);
    for (const [muro, largo] of Object.entries(sala.largos)) assert.equal(largoMuro(muro, encuadre, ancho), largo);
    assert.deepEqual(paredes(encuadre, ancho).map((p) => [p.clave, p.x, p.y, p.ancho, p.alto]), sala.paredes);
    for (const [muro, pos, ax, ay, lx, ly] of sala.muestras) {
      assert.deepEqual(ancla(muro, pos, encuadre, ancho), { x: ax, y: ay }, `${muro} ${pos}`);
      assert.deepEqual(llegada(muro, pos, encuadre, ancho), { x: lx, y: ly }, `${muro} ${pos}`);
    }
  });
}
