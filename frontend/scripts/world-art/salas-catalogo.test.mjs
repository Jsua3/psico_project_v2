// El catálogo que usa el motor de salas (`sala/catalogo.ts`) frente a Python y frente al manifiesto real de `biblioteca/piezas/`.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const REF = JSON.parse(readFileSync(new URL('./fixtures/salas-referencia.json', import.meta.url), 'utf8')).tablas;
const MANIFIESTO = JSON.parse(readFileSync(new URL('../../../biblioteca/piezas/manifiesto.json', import.meta.url), 'utf8'));
const c = await import('../../src/app/features/simulator/sala/catalogo.ts');

test('la luz de cada pieza es la de piezas_muro.PIEZAS', () => {
  assert.deepEqual(c.piezasConLuz().sort(), Object.keys(REF.luz).sort());
  for (const [clave, ref] of Object.entries(REF.luz)) {
    const [tipo, modelo] = clave.split('/');
    assert.deepEqual(c.luzDePieza(tipo, modelo), ref, clave);
  }
  assert.equal(c.luzDePieza('cuadro', 'cuadro'), null);
  assert.equal(c.luzDePieza('ventana', 'inexistente'), null);
});

test('el vano de cada puerta es el de piezas_puertas.MODELOS', () => {
  for (const [modelo, ancho] of Object.entries(REF.vanos)) assert.equal(c.vanoDePuerta(modelo), ancho, modelo);
  assert.equal(c.vanoDePuerta('inexistente'), null);
  assert.equal(c.vanoDePuerta('toString'), null);
});

test('lo que el manifiesto publica de la luz coincide con el catálogo del motor', () => {
  let vistas = 0;
  for (const [clave, ficha] of Object.entries(MANIFIESTO.piezas)) {
    const [tipo, modelo] = clave.split('/');
    const luz = c.luzDePieza(tipo, modelo);
    assert.equal(luz !== null, ficha.luz !== undefined, `${clave}: emite luz en un sitio y no en el otro`);
    if (!luz) continue;
    vistas += 1;
    for (const campo of ['forma', 'momento', 'tono', 'radio', 'ancho']) assert.deepEqual(luz[campo], ficha.luz[campo], `${clave}.${campo}`);
    assert.equal(luz.fuerza, ficha.luz.fuerza ?? 100, `${clave}.fuerza`);
  }
  assert.equal(vistas, Object.keys(REF.luz).length);
  for (const clave of Object.keys(MANIFIESTO.piezas)) {
    if (clave.startsWith('puerta/')) assert.notEqual(c.vanoDePuerta(clave.slice('puerta/'.length)), null, clave);
  }
});

test('esManifiestoDePiezas acepta el manifiesto real y rechaza lo que no es de esquema 2', () => {
  assert.equal(c.esManifiestoDePiezas(MANIFIESTO), true);
  assert.equal(c.esManifiestoDePiezas({ esquema: 1, sprites: {} }), false);
  assert.equal(c.esManifiestoDePiezas({ ...MANIFIESTO, piezas: [] }), false);
  assert.equal(c.esManifiestoDePiezas({ ...MANIFIESTO, pisos: undefined }), false);
  assert.equal(c.esManifiestoDePiezas(null), false);
  assert.equal(c.esManifiestoDePiezas('manifiesto'), false);
});

test('la ruta de una imagen del manifiesto se sirve bajo /assets/biblioteca/', () => {
  assert.equal(c.urlDePieza('piezas/pisos/vinilo-a.png'), '/assets/biblioteca/piezas/pisos/vinilo-a.png');
  assert.equal(c.MANIFIESTO_DE_PIEZAS_URL, '/assets/biblioteca/piezas/manifiesto.json');
});
