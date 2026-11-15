// Del mundo del servidor a la sala por piezas (`sala/mundo-a-sala.ts`), con el ejemplo completo del contrato x-siep 2.2
// (sección 7.2: la sala de espera del hospital, 1440 px). El umbral que el servidor pone en cada EXIT y la llegada que el
// cliente calcula para la misma puerta deben ser el mismo punto.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MANIFIESTO } from './salas-apoyo.mjs';

const { salaDelMundo, puertaDelObjeto } = await import('../../src/app/features/simulator/sala/mundo-a-sala.ts');
const { planDeSala } = await import('../../src/app/features/simulator/sala/composicion.ts');

const ESTRUCTURA = {
  ancho: 1440, momento: 'noche',
  acabados: { piso: 'vinilo', variante: 'a', muro: 'zocalo-alto', paleta: 'hospital' },
  piezas: [
    { id: 'v1', tipo: 'ventana', modelo: 'alta', muro: 'fondo', pos: 520 },
    { id: 'l1', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 720 },
    { id: 'r1', tipo: 'reloj', modelo: 'reloj', muro: 'fondo', pos: 856 },
    { id: 'l2', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 1000 },
    { id: 'c1', tipo: 'cruz', modelo: 'cruz', muro: 'derecha', pos: 64 },
    { id: 'lp', tipo: 'lampara', modelo: 'pie', x: 1180, y: 300 },
  ],
};
const MAPA = { key: 'sala-sala-espera', width: 1440, height: 528, ambient: { encuadre: 'tres-paredes', salaId: 'sala-espera', lugarId: 'hospital' }, structure: ESTRUCTURA };
const OBJETOS = [
  { key: 'a-pasillo', label: 'Pasar al pasillo', type: 'EXIT', x: 150, y: 406,
    metadata: { targetNodeKey: 'pasillo', entryX: 1511, entryY: 390, muro: 'izquierda', pos: 176, modelo: 'madera', par: 'a-sala-espera' } },
  { key: 'a-triaje', label: 'Pasar a triaje', type: 'EXIT', x: 1270, y: 260,
    metadata: { targetNodeKey: 'triaje', entryX: 480, entryY: 476, muro: 'fondo', pos: 1136, modelo: 'vidrio' } },
  { key: 'a-entrada', label: 'Volver a la entrada de urgencias', type: 'EXIT', x: 718, y: 476,
    metadata: { targetNodeKey: 'entrada-urgencias', entryX: 600, entryY: 260, muro: 'camara', pos: 584, modelo: 'corrediza' } },
  { key: 'abuela', label: 'Abuela', type: 'PERSON', x: 560, y: 340 },
  { key: 'puerta-vieja', label: 'Salir', type: 'EXIT', x: 900, y: 260, metadata: { targetNodeKey: 'otra', pintada: true } },
];

test('una sala con structure se arma con sus puertas de pieza; las demás puertas y objetos no entran', () => {
  const sala = salaDelMundo(MAPA, OBJETOS);
  assert.equal(sala.encuadre, 'tres-paredes');
  assert.equal(sala.estructura, ESTRUCTURA);
  assert.deepEqual(sala.puertas.map(p => p.id), ['a-pasillo', 'a-triaje', 'a-entrada']);
  assert.deepEqual(sala.puertas[0], { id: 'a-pasillo', muro: 'izquierda', pos: 176, modelo: 'madera', hacia: 'pasillo', par: 'a-sala-espera', etiqueta: 'Pasar al pasillo' });
  assert.equal(sala.puertas[1].par, undefined);
});

test('el umbral que pone el servidor en cada EXIT es la llegada que calcula el cliente para esa puerta', () => {
  const plan = planDeSala(salaDelMundo(MAPA, OBJETOS), MANIFIESTO, 'noche');
  assert.deepEqual(plan.avisos, []);
  for (const objeto of OBJETOS.slice(0, 3)) {
    const sprite = plan.sprites.find(s => s.id === objeto.key);
    assert.deepEqual(sprite.puerta.llegada, [objeto.x, objeto.y], objeto.key);
  }
  // Anclas en pantalla del contrato: a-pasillo (69, 406), a-triaje (1270, 230), a-entrada (718, 528).
  assert.deepEqual(plan.sprites.filter(s => s.puerta).map(s => s.puerta.ancla), [[69, 406], [1270, 230], [718, 528]]);
});

test('una sala de imagen fija (structure null o ausente) sigue por el camino de hoy', () => {
  assert.equal(salaDelMundo({ ...MAPA, structure: null }, OBJETOS), null);
  assert.equal(salaDelMundo({ width: 960 }, OBJETOS), null);
});

test('una structure que no se entiende no rompe nada: la sala sigue por el camino de hoy', () => {
  for (const mala of [{ ...ESTRUCTURA, ancho: 1000 }, { ...ESTRUCTURA, acabados: null }, { ...ESTRUCTURA, acabados: { piso: 'vinilo' } },
    { ...ESTRUCTURA, piezas: 'muchas' }, 'estructura', 42, []]) {
    assert.equal(salaDelMundo({ ...MAPA, structure: mala }, OBJETOS), null, JSON.stringify(mala));
  }
});

test('sin encuadre, o con uno desconocido, la sala es de tres paredes', () => {
  assert.equal(salaDelMundo({ structure: ESTRUCTURA }, []).encuadre, 'tres-paredes');
  assert.equal(salaDelMundo({ structure: ESTRUCTURA, ambient: { encuadre: 'circular' } }, []).encuadre, 'tres-paredes');
  assert.equal(salaDelMundo({ structure: ESTRUCTURA, ambient: { encuadre: 'una-pared' } }, []).encuadre, 'una-pared');
});

test('un EXIT sin muro, pos o modelo válidos no es puerta de pieza', () => {
  const base = { key: 'p', label: 'P', type: 'EXIT', metadata: { muro: 'fondo', pos: 100, modelo: 'madera' } };
  assert.notEqual(puertaDelObjeto(base), null);
  assert.notEqual(puertaDelObjeto({ ...base, type: 'exit' }), null);
  for (const metadata of [{ ...base.metadata, muro: 'techo' }, { ...base.metadata, pos: '100' }, { ...base.metadata, pos: Number.NaN },
    { ...base.metadata, modelo: '' }, null, undefined]) {
    assert.equal(puertaDelObjeto({ ...base, metadata }), null, JSON.stringify(metadata));
  }
  assert.equal(puertaDelObjeto({ ...base, type: 'TOOL' }), null);
});
