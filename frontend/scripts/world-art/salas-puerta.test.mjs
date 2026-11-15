// La máquina de estados de la puerta (`sala/puerta.ts`): apertura con anticipación y rebote, traqueteo de la cerrada con
// llave, puerta activa con histéresis y el cruce con su velo (diseño, sección 4.4; contrato de calidad, regla 6).
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const p = await import('../../src/app/features/simulator/sala/puerta.ts');

/** Los cuadros que se ven, uno por cada paso de 10 ms, durante `ms`. */
function cuadros(e, ms, opciones, hojas = 'una') {
  const vistos = [];
  for (let t = 0; t < ms; t += 10) {
    e = p.avanzarPuerta(e, { dtMs: 10, ...opciones });
    vistos.push(p.cuadroVisible(e, hojas));
  }
  return { e, vistos };
}
const sinRepetir = lista => lista.filter((c, i) => i === 0 || c !== lista[i - 1]);

test('cerca se abre en cuatro cuadros, despacio al arrancar, y la puerta de hoja rebota antes de asentarse', () => {
  const { e, vistos } = cuadros(p.PUERTA_CERRADA, 400, { cerca: true, bloqueada: false, reducido: false });
  assert.deepEqual(sinRepetir([0, ...vistos]), [0, 1, 2, 3, 2, 3]);
  // El primer cuadro dura más que los siguientes: anticipación.
  const cuanto = c => vistos.filter(v => v === c).length;
  assert.ok(cuanto(0) > cuanto(1), `cerrada ${cuanto(0)} pasos, primer cuadro ${cuanto(1)}`);
  assert.equal(vistos.indexOf(3), 20, 'abierta a los 210 ms');
  assert.equal(p.cuadroVisible(e), 3);
  assert.equal(p.abiertaDelTodo(e), true);
});

test('la corrediza y el paso abierto no rebotan', () => {
  for (const hojas of ['corrediza', 'ninguna']) {
    const { vistos } = cuadros(p.PUERTA_CERRADA, 400, { cerca: true, bloqueada: false, reducido: false }, hojas);
    assert.deepEqual(sinRepetir([0, ...vistos]), [0, 1, 2, 3], hojas);
  }
});

test('lejos se cierra por los mismos cuadros', () => {
  const { vistos } = cuadros(p.PUERTA_ABIERTA, 300, { cerca: false, bloqueada: false, reducido: false });
  assert.deepEqual(sinRepetir([3, ...vistos]), [3, 2, 1, 0]);
});

test('con movimiento reducido cambia de estado de una vez', () => {
  let e = p.avanzarPuerta(p.PUERTA_CERRADA, { dtMs: 16, cerca: true, bloqueada: false, reducido: true });
  assert.equal(p.cuadroVisible(e), 3);
  e = p.avanzarPuerta(e, { dtMs: 16, cerca: false, bloqueada: false, reducido: true });
  assert.equal(p.cuadroVisible(e), 0);
  assert.deepEqual(p.sacudir(p.PUERTA_CERRADA, true), p.PUERTA_CERRADA);
});

test('cerrada con llave no se abre; al intentarlo traquetea 180 ms y vuelve a su sitio', () => {
  let { e, vistos } = cuadros(p.PUERTA_CERRADA, 300, { cerca: true, bloqueada: true, reducido: false });
  assert.deepEqual(new Set(vistos), new Set([0]));
  e = p.sacudir(e, false);
  const golpes = [], desvios = [];
  for (let t = 0; t < 250; t += 15) {
    golpes.push(p.cuadroVisible(e));
    desvios.push(p.desvioDeSacudida(e));
    e = p.avanzarPuerta(e, { dtMs: 15, cerca: true, bloqueada: true, reducido: false });
  }
  assert.deepEqual(sinRepetir(golpes), [1, 0, 1, 0]);
  assert.deepEqual(sinRepetir(desvios), [1, -1, 1, 0]);
  assert.equal(p.cuadroVisible(e), 0);
  assert.equal(p.desvioDeSacudida(e), 0);
});

test('manda la puerta más cercana a menos de 56 px; lejos, ninguna', () => {
  const puertas = [{ id: 'a', umbral: [100, 260] }, { id: 'b', umbral: [180, 260] }];
  assert.equal(p.puertaActiva(puertas, { x: 100, y: 300 }, null), 'a');
  assert.equal(p.puertaActiva(puertas, { x: 170, y: 290 }, null), 'b');
  assert.equal(p.puertaActiva(puertas, { x: 100, y: 316 }, null), null, 'a 56 px exactos no alcanza');
  assert.equal(p.puertaActiva([], { x: 100, y: 260 }, null), null);
});

test('entre dos puertas vecinas el aviso no parpadea: la activa sigue hasta que otra la supera por más de 6 px', () => {
  const puertas = [{ id: 'a', umbral: [100, 260] }, { id: 'b', umbral: [140, 260] }];
  // A medio camino, un poco más cerca de b, pero la activa es a.
  assert.equal(p.puertaActiva(puertas, { x: 122, y: 262 }, 'a'), 'a');
  assert.equal(p.puertaActiva(puertas, { x: 128, y: 262 }, 'a'), 'b');
  // Al alejarse, la activa sigue hasta 60 px (no 56): no se apaga y enciende en el borde.
  assert.equal(p.puertaActiva(puertas.slice(0, 1), { x: 100, y: 318 }, 'a'), 'a');
  assert.equal(p.puertaActiva(puertas.slice(0, 1), { x: 100, y: 321 }, 'a'), null);
  // Una activa que ya no existe (otra sala) no se conserva.
  assert.equal(p.puertaActiva(puertas, { x: 100, y: 262 }, 'de-otra-sala'), 'a');
});

test('quien acaba de llegar por una puerta la tiene activa y abierta, pero no cruza solo', () => {
  const puertas = [{ id: 'vuelta', umbral: [313, 260] }];
  assert.equal(p.puertaActiva(puertas, { x: 313, y: 260 }, null), 'vuelta');
  // El cruce lo empieza solo la tecla E o el aviso: ningún estado de la puerta lo dispara.
  const { e } = cuadros(p.PUERTA_ABIERTA, 500, { cerca: true, bloqueada: false, reducido: false });
  assert.equal(p.cuadroVisible(e), 3);
});

test('el cruce: velo de 150 ms, espera a la sala nueva y velo de salida de 150 ms', () => {
  let c = p.iniciarCruce(false);
  const velos = [];
  for (let t = 0; t < 600; t += 25) {
    velos.push(p.opacidadDeCruce(c));
    c = p.avanzarCruce(c, 25, t >= 400, false);
  }
  assert.equal(velos[0], 0);
  assert.equal(velos[6], 1, 'a los 150 ms el velo está puesto');
  assert.ok(velos.slice(6, 16).every(v => v === 1), 'el velo espera a que la sala nueva esté lista');
  assert.equal(c.fase, 'fin');
  assert.equal(p.opacidadDeCruce(c), 0);
  assert.equal(p.cruceEnCurso(c), false);
  // Por escalones de 1/8, sin degradado continuo.
  assert.ok(velos.every(v => Number.isInteger(v * 8)));
  const subida = velos.slice(0, 7), bajada = velos.slice(velos.lastIndexOf(1));
  assert.deepEqual(subida, [...subida].sort((a, b) => a - b));
  assert.deepEqual(bajada, [...bajada].sort((a, b) => b - a));
});

test('el cruce con movimiento reducido no tiene velo y termina en cuanto la sala nueva está lista', () => {
  let c = p.iniciarCruce(true);
  assert.equal(c.fase, 'espera');
  assert.equal(p.opacidadDeCruce(c, true), 0);
  assert.equal(p.cruceEnCurso(c), true);
  c = p.avanzarCruce(c, 16, false, true);
  assert.equal(c.fase, 'espera');
  c = p.avanzarCruce(c, 16, true, true);
  assert.equal(c.fase, 'fin');
});

test('un paso largo (la pestaña estaba quieta) no se salta la espera', () => {
  const c = p.avanzarCruce(p.iniciarCruce(false), 5000, false, false);
  assert.equal(c.fase, 'espera');
});

test('mientras cae el velo, quien cruza avanza del umbral hacia la puerta, hasta 24 px', () => {
  const umbral = [313, 260], ancla = [313, 230];
  assert.deepEqual(p.posicionAlCruzar(umbral, ancla, { fase: 'salida', ms: 0 }), [313, 260]);
  assert.deepEqual(p.posicionAlCruzar(umbral, ancla, { fase: 'salida', ms: 75 }), [313, 248]);
  assert.deepEqual(p.posicionAlCruzar(umbral, ancla, { fase: 'salida', ms: 150 }), [313, 236]);
  assert.deepEqual(p.posicionAlCruzar(umbral, ancla, { fase: 'espera', ms: 0 }), [313, 260]);
  assert.deepEqual(p.posicionAlCruzar([150, 406], [69, 406], { fase: 'salida', ms: 150 }), [126, 406]);
  assert.deepEqual(p.posicionAlCruzar([100, 100], [100, 100], { fase: 'salida', ms: 150 }), [100, 100]);
});
