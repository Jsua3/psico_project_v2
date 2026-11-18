// El catálogo que usa el motor de salas (`sala/catalogo.ts`) frente al manifiesto real de `biblioteca/piezas/`.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CASOS_DE_LUZ, MANIFIESTO } from './salas-apoyo.mjs';

const c = await import('../../src/app/features/simulator/sala/catalogo.ts');

test('la luz de cada pieza se lee del manifiesto, con sus valores por defecto', () => {
  assert.deepEqual(c.luzDePieza(MANIFIESTO.piezas, 'ventana', 'alta'),
    { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 70, ancho: 120, antepecho: 100, alto: 32, radio: [0, 0], altura: 150,
      parteluces: { verticales: [341, 683] } });
  assert.deepEqual(c.luzDePieza(MANIFIESTO.piezas, 'ventana', 'corrediza'),
    { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 100, ancho: 96, antepecho: 70, alto: 60, radio: [0, 0], altura: 150,
      parteluces: { verticales: [512], horizontales: [512] } });
  assert.deepEqual(c.luzDePieza(MANIFIESTO.piezas, 'lampara', 'pie'),
    { forma: 'pozo', momento: 'noche', tono: 'calido', fuerza: 100, ancho: 0, antepecho: 0, alto: 0, radio: [124, 48], altura: 58,
      parteluces: { verticales: [512] } });
  assert.deepEqual(c.luzDePieza(MANIFIESTO.piezas, 'lampara', 'tubo'),
    { forma: 'tubo', momento: 'noche', tono: 'frio', fuerza: 100, ancho: 0, antepecho: 0, alto: 0, radio: [250, 120], altura: 150,
      parteluces: { verticales: [512] } });
  let emiten = 0;
  for (const [clave, ficha] of Object.entries(MANIFIESTO.piezas)) {
    const [tipo, modelo] = clave.split('/');
    assert.equal(c.luzDePieza(MANIFIESTO.piezas, tipo, modelo) !== null, ficha.luz !== undefined, clave);
    if (ficha.luz) emiten += 1;
  }
  assert.equal(emiten, 8);
});

test('el catálogo de la referencia congelada de P1 se lee igual que el manifiesto', () => {
  for (const clave of Object.keys(CASOS_DE_LUZ.catalogo)) {
    const [tipo, modelo] = clave.split('/');
    assert.deepEqual(c.luzDePieza(CASOS_DE_LUZ.catalogo, tipo, modelo), c.luzDePieza(MANIFIESTO.piezas, tipo, modelo), clave);
    if (tipo === 'puerta') assert.equal(c.vanoDePuerta(CASOS_DE_LUZ.catalogo, modelo), c.vanoDePuerta(MANIFIESTO.piezas, modelo), clave);
  }
});

test('la forma de la ventana: la persiana trae lamas; sin forma, o con una que no se entiende, un parteluz al medio', () => {
  assert.deepEqual(c.luzDePieza(MANIFIESTO.piezas, 'ventana', 'persiana').parteluces, { verticales: [512], lamas: [410, 1024, 8] });
  const rara = { 'ventana/rara': { luz: { forma: 'haz', momento: 'dia', tono: 'calido', ancho: 90, parteluces: { lamas: [1, 2, 0], verticales: 'x' } } } };
  assert.deepEqual(c.luzDePieza(rara, 'ventana', 'rara').parteluces, {});
  const sin = { 'ventana/sin': { luz: { forma: 'haz', momento: 'dia', tono: 'calido', ancho: 90 } } };
  assert.deepEqual(c.luzDePieza(sin, 'ventana', 'sin').parteluces, { verticales: [512] });
});

test('una ficha de luz que no se entiende cuenta como «no emite»', () => {
  const catalogo = {
    'a/sin-forma': { luz: { momento: 'dia', tono: 'calido' } },
    'a/forma-rara': { luz: { forma: 'rayo', momento: 'dia', tono: 'calido', ancho: 90 } },
    'a/haz-sin-ancho': { luz: { forma: 'haz', momento: 'dia', tono: 'calido' } },
    'a/pozo-sin-radio': { luz: { forma: 'pozo', momento: 'noche', tono: 'calido' } },
    'a/radio-cero': { luz: { forma: 'tubo', momento: 'noche', tono: 'frio', radio: [0, 40] } },
    'a/texto': { luz: 'mucha' },
    'a/nada': {},
  };
  for (const clave of Object.keys(catalogo)) assert.equal(c.luzDePieza(catalogo, 'a', clave.slice(2)), null, clave);
  assert.equal(c.luzDePieza(catalogo, 'a', 'inexistente'), null);
  assert.equal(c.luzDePieza(MANIFIESTO.piezas, 'cuadro', 'cuadro'), null);
  assert.equal(c.luzDePieza(MANIFIESTO.piezas, 'toString', ''), null);
});

test('el vano de cada puerta sale del manifiesto', () => {
  const vanos = { madera: 56, 'madera-ventanilla': 56, vidrio: 56, corrediza: 136, urgencias: 86, metalica: 58, paso: 72 };
  for (const [modelo, ancho] of Object.entries(vanos)) assert.equal(c.vanoDePuerta(MANIFIESTO.piezas, modelo), ancho, modelo);
  assert.equal(c.vanoDePuerta(MANIFIESTO.piezas, 'inexistente'), null);
  assert.equal(c.vanoDePuerta({ 'puerta/rara': { ancho: 'ancha' } }, 'rara'), null);
});

test('encendida vale en la forma de P1 (siempre, nunca) y en la del contrato 2.2 (booleano)', () => {
  assert.deepEqual(['siempre', true, 'nunca', false, 'auto', undefined].map(encendida => c.encendidaForzada({ encendida })),
    [true, true, false, false, null, null]);
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
