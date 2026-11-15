// Igualdad píxel a píxel de la luz: `calcularLuz` del cliente contra `piezas_luz.calcular_luz` de Python (diseño, secciones 4.3 y 9).
//
// Dos referencias:
// - La congelada de P1 (`biblioteca/piezas/luz/`): seis salas con muebles y personas que arrojan sombra y una puerta abierta,
//   de día y de noche, como imágenes. Es la prueba que pide el diseño.
// - La de `python tools/escenarios/piezas_referencia.py` (huellas): más salas, encuadres y anchos, sin cuerpos.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CASOS_DE_LUZ, MANIFIESTO, REF, huellaRgb, leerPng, pixelesDistintos, primerPixelDistinto, salaDe } from './salas-apoyo.mjs';

const { CONSTANTES_DE_LUZ, TABLA_AMBIENTE, TABLA_CALIDA, TABLA_FRIA, calcularLuz, cuerpo, prepararLuz } =
  await import('../../src/app/features/simulator/sala/luz.ts');

const PASO_X = 48, PASO_Y = 33, ALTO = 528;
const CATALOGO = MANIFIESTO.piezas;

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

test('las tablas y las constantes de la luz son las de Python y las del manifiesto', () => {
  assert.deepEqual(TABLA_AMBIENTE, REF.tablas.ambiente);
  assert.deepEqual(TABLA_CALIDA, REF.tablas.calida);
  assert.deepEqual(TABLA_FRIA, REF.tablas.fria);
  const m = MANIFIESTO.luz;
  assert.deepEqual(TABLA_AMBIENTE, m.tablaAmbiente);
  assert.deepEqual(TABLA_CALIDA, m.tablaCalida);
  assert.deepEqual(TABLA_FRIA, m.tablaFria);
  for (const [clave, valor] of Object.entries(CONSTANTES_DE_LUZ)) assert.deepEqual(valor, m[clave], `luz.${clave}`);
  assert.deepEqual(CASOS_DE_LUZ.constantes.hazFondo, CONSTANTES_DE_LUZ.hazFondo);
});

test('la huella de un cuerpo sale del tamaño de su sprite, como en Python', () => {
  assert.deepEqual(cuerpo(300, 300, 98, 44), { x0: 253, x1: 347, y0: 284, y1: 300, alto: 36 });   // la camilla del manifiesto
  assert.deepEqual(cuerpo(100, 200, 24, 34), { x0: 90, x1: 110, y0: 192, y1: 200, alto: 30 });
  assert.deepEqual(cuerpo(480, 372, 48, 72, true), { x0: 471, x1: 489, y0: 362, y1: 372, alto: 60 });
  const camilla = MANIFIESTO.muebles['hospital/camilla'];
  const c = cuerpo(0, 0, camilla.ancho, camilla.alto);
  assert.deepEqual({ ancho: c.x1 - c.x0, fondo: c.y1 - c.y0, alto: c.alto }, camilla.huella);
});

// ── la referencia congelada de P1 ───────────────────────────────────────────────

test('la referencia congelada trae seis salas, de día y de noche', () => {
  assert.equal(CASOS_DE_LUZ.casos.length, 6);
  for (const caso of CASOS_DE_LUZ.casos) assert.deepEqual(Object.keys(caso.salidas).sort(), ['dia', 'noche'], caso.id);
});

for (const caso of CASOS_DE_LUZ.casos) {
  for (const momento of ['dia', 'noche']) {
    test(`referencia congelada · ${caso.id} de ${momento}: ambiente y brillo iguales píxel a píxel`, () => {
      const capas = calcularLuz(caso.sala, CASOS_DE_LUZ.catalogo, { momento, abiertas: caso.abiertas, cuerpos: caso.cuerpos });
      for (const capa of ['ambiente', 'brillo']) {
        const esperada = leerPng(caso.salidas[momento][capa]);
        assert.deepEqual([capas.ancho, capas.alto], [esperada.ancho, esperada.alto], `${caso.id}: tamaño`);
        const distinto = primerPixelDistinto(capas[capa], esperada.rgba, capas.ancho);
        assert.equal(distinto, null, distinto
          ? `${caso.id} de ${momento}, ${capa}: ${pixelesDistintos(capas[capa], esperada.rgba)} píxeles distintos; el primero en `
            + `(${distinto.x}, ${distinto.y}): sale ${distinto.obtenido} y se espera ${distinto.esperado}`
          : '');
      }
    });
  }
}

test('los cuerpos cambian la luz: sin ellos la sala de la referencia sale distinta', () => {
  const caso = CASOS_DE_LUZ.casos.find(c => c.id === 'casa-sala');
  const con = calcularLuz(caso.sala, CASOS_DE_LUZ.catalogo, { momento: 'dia', cuerpos: caso.cuerpos });
  const sin = calcularLuz(caso.sala, CASOS_DE_LUZ.catalogo, { momento: 'dia' });
  assert.ok(pixelesDistintos(con.ambiente, sin.ambiente) > 200, 'las sombras de los muebles deben verse en el haz de la ventana');
});

// ── la referencia por huellas: más salas, encuadres y anchos ────────────────────

test('hay al menos seis salas, de día y de noche, en la referencia por huellas', () => {
  const salas = new Set(REF.luz.map(c => c.sala));
  assert.ok(salas.size >= 6, `solo ${salas.size} salas`);
  for (const sala of salas) {
    for (const momento of ['dia', 'noche']) assert.ok(REF.luz.some(c => c.sala === sala && c.momento === momento && !c.abiertas.length), `${sala} de ${momento}`);
  }
});

for (const caso of REF.luz) {
  test(`luz de ${caso.id}: ambiente y brillo iguales píxel a píxel`, () => {
    const luz = prepararLuz(salaDe(caso.sala), CATALOGO, { momento: caso.momento });
    luz.abrir(caso.abiertas);
    const capas = luz.capas();
    assert.equal(capas.ancho, caso.ancho);
    assert.equal(capas.alto, ALTO);
    const iguales = huellaRgb(capas.ambiente) === caso.ambiente && huellaRgb(capas.brillo) === caso.brillo;
    assert.ok(iguales, `${caso.id}: ${iguales ? '' : primeraDiferencia(luz.escalones(), caso.ancho, caso.muestra)}`);
  });
}

test('abrir y cerrar puertas repinta solo su rectángulo y deja la luz igual a calcularla de cero', () => {
  for (const caso of REF.luz.filter(c => c.abiertas.length)) {
    const sala = salaDe(caso.sala);
    const cerrada = REF.luz.find(c => c.sala === caso.sala && c.momento === caso.momento && !c.abiertas.length);
    const luz = prepararLuz(sala, CATALOGO, { momento: caso.momento });
    assert.equal(huellaRgb(luz.capas().ambiente), cerrada.ambiente, `${caso.id}: recién preparada`);
    assert.equal(luz.abrir([]), null, 'nada cambia: no hay rectángulo que repintar');

    const zona = luz.abrir(caso.abiertas);
    assert.ok(zona && zona.w > 0 && zona.h > 0, `${caso.id}: la cuña cambia un rectángulo`);
    assert.ok(zona.x >= 0 && zona.y >= 0 && zona.x + zona.w <= caso.ancho && zona.y + zona.h <= ALTO);
    assert.ok(zona.w * zona.h < caso.ancho * ALTO / 4, `${caso.id}: no se repinta la sala entera`);
    assert.equal(huellaRgb(luz.capas().ambiente), caso.ambiente, `${caso.id}: abierta`);
    assert.equal(huellaRgb(luz.capas().brillo), caso.brillo, `${caso.id}: abierta`);
    assert.equal(luz.abrir(caso.abiertas), null, 'abrir lo ya abierto no cambia nada');

    luz.abrir([]);
    assert.equal(huellaRgb(luz.capas().ambiente), cerrada.ambiente, `${caso.id}: cerrada de nuevo`);
    assert.equal(huellaRgb(luz.capas().brillo), cerrada.brillo, `${caso.id}: cerrada de nuevo`);
    // calcularLuz es el mismo cálculo, de una sola vez.
    const directa = calcularLuz(sala, CATALOGO, { momento: caso.momento, abiertas: caso.abiertas });
    assert.equal(huellaRgb(directa.ambiente), caso.ambiente);
  }
});

test('una puerta que no es del muro del fondo no cambia la luz', () => {
  const sala = salaDe('sintetica/ancha');
  const luz = prepararLuz(sala, CATALOGO, { momento: 'dia' });
  assert.equal(luz.abrir(['p-izq', 'p-der', 'p-cam']), null);
});

test('una puerta abierta en el exterior, de día, repinta todo: su luz borra la sombra corta del muro', () => {
  const sala = salaDe('casa/fachada');
  const puerta = sala.puertas.find(p => p.muro === 'fondo');
  const luz = prepararLuz(sala, CATALOGO, { momento: 'dia' });
  assert.deepEqual(luz.abrir([puerta.id]), { x: 0, y: 0, w: 960, h: ALTO });
});

test('lo que la estructura trae mal no rompe la luz', () => {
  const sala = salaDe('hospital/triaje');
  sala.estructura.piezas.push({ tipo: 'ventana', modelo: 'inexistente', muro: 'fondo', pos: 100 }, { tipo: 'lampara', modelo: 'tubo' });
  sala.puertas.push({ id: 'rara', muro: 'fondo', pos: 300, modelo: 'inexistente' });
  const limpia = REF.luz.find(c => c.id === 'hospital/triaje@noche');
  const capas = calcularLuz(sala, CATALOGO, { momento: 'noche', abiertas: ['rara'] });
  assert.equal(huellaRgb(capas.ambiente), limpia.ambiente);
  // Sin catálogo no hay emisores: la sala queda en penumbra, pero se calcula.
  assert.equal(calcularLuz(sala, {}, { momento: 'noche' }).ancho, 960);
  assert.throws(() => calcularLuz({ ...sala, estructura: { ...sala.estructura, ancho: 1000 } }, CATALOGO), /fuera del catálogo/);
});

test('encendida como booleano (contrato 2.2) da la misma luz que siempre y nunca', () => {
  const sala = salaDe('sintetica/ancha');
  const conBooleanos = structuredClone(sala);
  for (const pieza of conBooleanos.estructura.piezas) {
    if (pieza.encendida === 'siempre') pieza.encendida = true;
    if (pieza.encendida === 'nunca') pieza.encendida = false;
  }
  for (const momento of ['dia', 'noche']) {
    assert.equal(huellaRgb(calcularLuz(conBooleanos, CATALOGO, { momento }).ambiente), REF.luz.find(c => c.id === `sintetica/ancha@${momento}`).ambiente);
  }
});

test('la luz de la sala más ancha, con muebles, se calcula en menos de 400 ms', () => {
  const caso = CASOS_DE_LUZ.casos.find(c => c.id === 'ancha-1920');
  const opciones = { momento: 'noche', cuerpos: caso.cuerpos };
  calcularLuz(caso.sala, CASOS_DE_LUZ.catalogo, opciones);   // calienta
  const inicio = performance.now();
  calcularLuz(caso.sala, CASOS_DE_LUZ.catalogo, opciones);
  const ms = performance.now() - inicio;
  assert.ok(ms < 400, `tardó ${ms.toFixed(0)} ms`);
});
