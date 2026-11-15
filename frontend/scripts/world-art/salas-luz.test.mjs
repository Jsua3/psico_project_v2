// Igualdad píxel a píxel de la luz: `calcularLuz` del cliente contra `piezas_luz.calcular_luz` de Python (diseño, secciones 4.3 y 9).
// La referencia (huellas SHA-256 de los bytes RGB de cada capa) sale de `python tools/escenarios/piezas_referencia.py`.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const REF = JSON.parse(readFileSync(new URL('./fixtures/salas-referencia.json', import.meta.url), 'utf8'));
const { calcularLuz, prepararLuz, TABLA_AMBIENTE, TABLA_CALIDA, TABLA_FRIA } = await import('../../src/app/features/simulator/sala/luz.ts');

const PASO_X = 48, PASO_Y = 33, ALTO = 528;
const lugares = new Map();

/** La sala de un caso: una sintética escrita en la referencia o una de `biblioteca/piezas/lugares/`. */
function salaDe(clave) {
  const [lugar, id] = clave.split('/');
  if (lugar === 'sintetica') return structuredClone(REF.sinteticas[id]);
  if (!lugares.has(lugar)) {
    lugares.set(lugar, JSON.parse(readFileSync(new URL(`../../../biblioteca/piezas/lugares/${lugar}.json`, import.meta.url), 'utf8')));
  }
  return structuredClone(lugares.get(lugar).salas.find(s => s.id === id));
}

function huella(rgba) {
  const rgb = Buffer.alloc((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return createHash('sha256').update(rgb).digest('hex');
}

/** Dónde difiere la muestra de escalones, para que un fallo diga algo más que «la huella no es». */
function primeraDiferencia(escalones, ancho, muestra) {
  let k = 0;
  for (let y = 0; y < ALTO; y += PASO_Y) {
    for (let x = 0; x < ancho; x += PASO_X, k += 2) {
      const e = escalones[y * ancho + x];
      const mio = (e & 15).toString(16) + (((e >> 4) & 3) * 4 + ((e >> 6) & 3)).toString(16);
      const suyo = muestra.slice(k, k + 2);
      if (mio !== suyo) return `en (${x}, ${y}) el cliente da nivel/tono ${mio} y Python ${suyo}`;
    }
  }
  return 'la muestra coincide: la diferencia está entre los puntos de la muestra';
}

test('las tablas de ambiente y de brillo son las de Python', () => {
  assert.deepEqual(TABLA_AMBIENTE, REF.tablas.ambiente);
  assert.deepEqual(TABLA_CALIDA, REF.tablas.calida);
  assert.deepEqual(TABLA_FRIA, REF.tablas.fria);
});

test('hay al menos seis salas, de día y de noche, en la referencia', () => {
  const salas = new Set(REF.luz.map(c => c.sala));
  assert.ok(salas.size >= 6, `solo ${salas.size} salas`);
  for (const sala of salas) {
    for (const momento of ['dia', 'noche']) assert.ok(REF.luz.some(c => c.sala === sala && c.momento === momento && !c.abiertas.length), `${sala} de ${momento}`);
  }
});

for (const caso of REF.luz) {
  test(`luz de ${caso.id}: ambiente y brillo iguales píxel a píxel`, () => {
    const luz = prepararLuz(salaDe(caso.sala), caso.momento);
    luz.abrir(caso.abiertas);
    const capas = luz.capas();
    assert.equal(capas.ancho, caso.ancho);
    assert.equal(capas.alto, ALTO);
    const iguales = huella(capas.ambiente) === caso.ambiente && huella(capas.brillo) === caso.brillo;
    assert.ok(iguales, `${caso.id}: ${iguales ? '' : primeraDiferencia(luz.escalones(), caso.ancho, caso.muestra)}`);
    // calcularLuz es el mismo cálculo de una sola vez.
    const directa = calcularLuz(salaDe(caso.sala), caso.momento, caso.abiertas);
    assert.equal(huella(directa.ambiente), caso.ambiente);
    assert.equal(huella(directa.brillo), caso.brillo);
  });
}

test('abrir y cerrar puertas repinta solo su rectángulo y deja la luz igual a calcularla de cero', () => {
  for (const caso of REF.luz.filter(c => c.abiertas.length)) {
    const sala = salaDe(caso.sala);
    const cerrada = REF.luz.find(c => c.sala === caso.sala && c.momento === caso.momento && !c.abiertas.length);
    const luz = prepararLuz(sala, caso.momento);
    assert.equal(huella(luz.capas().ambiente), cerrada.ambiente, `${caso.id}: recién preparada`);
    assert.equal(luz.abrir([]), null, 'nada cambia: no hay rectángulo que repintar');

    const zona = luz.abrir(caso.abiertas);
    const delFondo = (sala.puertas ?? []).filter(p => caso.abiertas.includes(p.id) && p.muro === 'fondo');
    if (delFondo.length === 0) {
      assert.equal(zona, null, 'una puerta que no es del fondo no cambia la luz');
    } else {
      assert.ok(zona && zona.w > 0 && zona.h > 0, `${caso.id}: la cuña cambia un rectángulo`);
      assert.ok(zona.x >= 0 && zona.y >= 0 && zona.x + zona.w <= caso.ancho && zona.y + zona.h <= ALTO);
    }
    assert.equal(huella(luz.capas().ambiente), caso.ambiente, `${caso.id}: abierta`);
    assert.equal(huella(luz.capas().brillo), caso.brillo, `${caso.id}: abierta`);
    assert.equal(luz.abrir(caso.abiertas), null, 'abrir lo ya abierto no cambia nada');

    luz.abrir([]);
    assert.equal(huella(luz.capas().ambiente), cerrada.ambiente, `${caso.id}: cerrada de nuevo`);
    assert.equal(huella(luz.capas().brillo), cerrada.brillo, `${caso.id}: cerrada de nuevo`);
  }
});

test('una puerta abierta en el exterior, de día, repinta todo: su luz borra la sombra corta del muro', () => {
  const sala = salaDe('casa/fachada');
  const puerta = sala.puertas.find(p => p.muro === 'fondo');
  const luz = prepararLuz(sala, 'dia');
  assert.deepEqual(luz.abrir([puerta.id]), { x: 0, y: 0, w: 960, h: ALTO });
});

test('lo que la estructura trae mal no rompe la luz', () => {
  const sala = salaDe('hospital/triaje');
  sala.estructura.piezas.push({ tipo: 'ventana', modelo: 'inexistente', muro: 'fondo', pos: 100 }, { tipo: 'lampara', modelo: 'tubo' });
  sala.puertas.push({ id: 'rara', muro: 'fondo', pos: 300, modelo: 'inexistente' });
  const limpia = REF.luz.find(c => c.id === 'hospital/triaje@noche');
  const capas = calcularLuz(sala, 'noche', ['rara']);
  assert.equal(huella(capas.ambiente), limpia.ambiente);
  assert.throws(() => calcularLuz({ ...sala, estructura: { ...sala.estructura, ancho: 1000 } }), /fuera del catálogo/);
});

test('la luz de la sala más ancha se calcula en menos de 400 ms', () => {
  const sala = salaDe('sintetica/ancha');
  calcularLuz(sala, 'noche');   // calienta
  const inicio = performance.now();
  calcularLuz(sala, 'noche');
  const ms = performance.now() - inicio;
  assert.ok(ms < 400, `tardó ${ms.toFixed(0)} ms`);
});
