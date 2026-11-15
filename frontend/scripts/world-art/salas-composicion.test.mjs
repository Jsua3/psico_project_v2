// Paridad de la composición de la sala: `planDeSala` coloca cada pieza donde `piezas_sala.capas` de Python, y la sala pintada
// con `sala/pintor.ts` (fondo, sin luz y con luz) es idéntica, píxel a píxel, a `piezas_sala.componer_sala`.
// La referencia (huellas y sitio de cada sprite) sale de `python tools/escenarios/piezas_referencia.py`.
import './ts-sin-extension.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MANIFIESTO, REF, huellaRgb, leerPng, salaDe } from './salas-apoyo.mjs';

const { CIELO_DE_NOCHE, VACIO, planDeSala, rutasDelPlan } = await import('../../src/app/features/simulator/sala/composicion.ts');
const { componerSala, pintarFondo } = await import('../../src/app/features/simulator/sala/pintor.ts');
const { calcularLuz, prepararLuz } = await import('../../src/app/features/simulator/sala/luz.ts');

const imagenesDe = plan => new Map(rutasDelPlan(plan).map(ruta => [ruta, leerPng(ruta)]));

function salaDelCaso(caso) {
  const sala = salaDe(caso.sala);
  if (caso.sinTapetes) delete sala.estructura.tapetes;
  return sala;
}

test('los colores del vacío y del cielo de noche son los de Python', () => {
  assert.deepEqual(VACIO, REF.geometria.constantes.vacio);
  assert.deepEqual(CIELO_DE_NOCHE, REF.geometria.constantes.noche);
});

test('la referencia cubre las ocho salas del hospital, de día y de noche', () => {
  const hospital = new Set(REF.composicion.filter(c => c.sala.startsWith('hospital/')).map(c => `${c.sala}@${c.momento}`));
  assert.equal(hospital.size, 16);
});

for (const caso of REF.composicion) {
  test(`plan de ${caso.id}: cada pieza y cada puerta queda donde la pone Python`, () => {
    const plan = planDeSala(salaDelCaso(caso), MANIFIESTO, caso.momento);
    assert.deepEqual(plan.avisos, caso.avisos);
    assert.deepEqual([plan.ancho, plan.alto, plan.momento], [caso.ancho, 528, caso.momento]);
    assert.deepEqual(plan.zona, caso.zona);
    assert.deepEqual(plan.sprites.map(s => s.id), caso.sprites.map(s => s.id));
    plan.sprites.forEach((s, n) => {
      const ref = caso.sprites[n];
      assert.deepEqual({ tipo: s.tipo, modelo: s.modelo, capa: s.capa, x: s.x, y: s.y, w: s.w, h: s.h, z: s.z },
        { tipo: ref.tipo, modelo: ref.modelo, capa: ref.capa, x: ref.x, y: ref.y, w: ref.w, h: ref.h, z: ref.z }, `${caso.id}: ${s.id}`);
      assert.equal(s.fps, ref.fps, `${s.id}: fps`);
      if (ref.llegada) assert.deepEqual(s.puerta.llegada, ref.llegada, `${s.id}: llegada`);
      else assert.equal(s.puerta, undefined, `${s.id}: no es puerta`);
      // Python guarda de las lámparas de piso solo el cuadro elegido; del resto, la tira entera.
      if (ref.capa !== 'piso') assert.equal(s.cuadros, ref.cuadros, `${s.id}: cuadros`);
    });
  });

  test(`sala de ${caso.id}: fondo, sala sin luz y sala con luz iguales píxel a píxel`, () => {
    const sala = salaDelCaso(caso);
    const plan = planDeSala(sala, MANIFIESTO, caso.momento);
    const imagenes = imagenesDe(plan);
    assert.equal(huellaRgb(pintarFondo(plan, imagenes).rgba), caso.fondo, `${caso.id}: fondo (piso, muros y sombra de lo que cuelga)`);
    assert.equal(huellaRgb(componerSala(plan, imagenes, null, caso.abiertas).rgba), caso.sinLuz, `${caso.id}: con las piezas, sin luz`);
    const luz = calcularLuz(sala, MANIFIESTO.piezas, { momento: caso.momento, abiertas: caso.abiertas });
    // El brillo de cada pieza se mide sobre la luz de la sala sin las puertas abiertas, como en `piezas_sala.capas`.
    const medida = prepararLuz(sala, MANIFIESTO.piezas, { momento: caso.momento });
    const conLuz = componerSala(plan, imagenes, luz, caso.abiertas, (x, y) => medida.reflejoEn(x, y));
    assert.equal(huellaRgb(conLuz.rgba), caso.conLuz, `${caso.id}: con luz y brillo`);
  });
}

// ── lo que la estructura trae mal (la sala se arma igual, sin lo que falla) ─────

const base = () => salaDe('hospital/triaje');
const planDe = sala => planDeSala(sala, MANIFIESTO, 'noche');
const limpio = planDe(base());

test('una pieza que no está en el catálogo se omite con aviso y el resto se arma', () => {
  const sala = base();
  sala.estructura.piezas.push({ id: 'rara', tipo: 'ventana', modelo: 'ojo-de-buey', muro: 'fondo', pos: 200 },
    { id: 'puerta-en-piezas', tipo: 'puerta', modelo: 'madera', muro: 'fondo', pos: 300 });
  sala.puertas.push({ id: 'p-rara', muro: 'fondo', pos: 400, modelo: 'giratoria' });
  const plan = planDe(sala);
  assert.deepEqual(plan.sprites.map(s => s.id), limpio.sprites.map(s => s.id));
  assert.equal(plan.avisos.length, 3);
  assert.match(plan.avisos[0], /rara.*ventana\/ojo-de-buey.*catálogo/);
  assert.match(plan.avisos[2], /p-rara.*giratoria.*catálogo/);
});

test('una pieza en un muro que el encuadre no tiene, o fuera de su largo, se omite con aviso', () => {
  const sala = salaDe('casa/escalera');   // dos-paredes-izquierda: no hay muro derecho
  const antes = planDeSala(sala, MANIFIESTO, 'dia').sprites.length;
  sala.estructura.piezas.push({ id: 'en-derecha', tipo: 'reloj', modelo: 'reloj', muro: 'derecha', pos: 100 },
    { id: 'lejos', tipo: 'reloj', modelo: 'reloj', muro: 'fondo', pos: 5000 },
    { id: 'negativa', tipo: 'reloj', modelo: 'reloj', muro: 'fondo', pos: -8 },
    { id: 'sin-pos', tipo: 'reloj', modelo: 'reloj', muro: 'fondo' },
    { id: 'muro-raro', tipo: 'reloj', modelo: 'reloj', muro: 'techo', pos: 10 },
    { id: 'en-camara', tipo: 'reloj', modelo: 'reloj', muro: 'camara', pos: 100 });
  sala.puertas.push({ id: 'p-derecha', muro: 'derecha', pos: 100, modelo: 'madera' });
  const plan = planDeSala(sala, MANIFIESTO, 'dia');
  assert.equal(plan.sprites.length, antes);
  assert.equal(plan.avisos.length, 7);
  assert.match(plan.avisos[0], /en-derecha.*no tiene muro/);
  assert.match(plan.avisos[1], /lejos.*fuera del muro/);
  assert.match(plan.avisos[5], /en-camara.*no va en el muro camara/);
});

test('una lámpara de piso sin x e y se omite con aviso', () => {
  const sala = base();
  sala.estructura.piezas.push({ id: 'pie', tipo: 'lampara', modelo: 'pie', muro: 'fondo', pos: 100 });
  const plan = planDe(sala);
  assert.equal(plan.sprites.length, limpio.sprites.length);
  assert.match(plan.avisos[0], /pie.*x e y/);
});

test('un acabado desconocido deja la sala sin esa capa y lo avisa', () => {
  const sala = base();
  sala.estructura.acabados = { piso: 'marmol', muro: 'espejos', paleta: 'hospital' };
  const plan = planDe(sala);
  assert.equal(plan.fondo.length, 0);
  assert.equal(plan.avisos.length, 2);
  assert.equal(plan.sprites.length, limpio.sprites.length);
  // Sin piso ni muros la sala sale sobre el vacío, pero se pinta.
  const escena = pintarFondo(plan, imagenesDe(plan));
  assert.deepEqual([...escena.rgba.slice(0, 4)], [...VACIO, 255]);
});

test('un tapete sin imagen se omite con aviso; con imagen entra entre el piso y el muro', () => {
  const sala = base();
  sala.estructura.tapetes = [{ caja: [236, 548, 318, 420] }, { ruta: 'piezas/tapetes/triaje.png', x: 200, y: 300 }];
  const plan = planDe(sala);
  assert.match(plan.avisos[0], /tapete/);
  assert.deepEqual(plan.fondo.map(r => r.ruta.split('/')[1]), ['pisos', 'tapetes', 'muros', 'muros', 'muros']);
  assert.deepEqual(plan.fondo[1], { ruta: 'piezas/tapetes/triaje.png', x: 200, y: 300 });
});

test('una capa propia o un tapete con una ruta que no es de la biblioteca de piezas no se carga', () => {
  const sala = base();
  sala.estructura.propios = [{ ruta: '../../secreto.png' }, { ruta: 'https://ejemplo.invalid/a.png' }, { ruta: 'piezas/propios/casa-sala.png' }];
  sala.estructura.tapetes = [{ ruta: '/etc/tapete.png' }];
  const plan = planDe(sala);
  assert.deepEqual(plan.fondo.filter(r => !r.ruta.startsWith('piezas/pisos') && !r.ruta.startsWith('piezas/muros')).map(r => r.ruta),
    ['piezas/propios/casa-sala.png']);
  assert.equal(plan.avisos.length, 3);
});

test('una imagen que no cargó no rompe la pintura: esa capa o esa pieza falta y lo demás se ve', () => {
  const plan = planDe(base());
  const imagenes = imagenesDe(plan);
  imagenes.delete(plan.sprites[0].ruta);
  imagenes.delete(plan.fondo[0].ruta);
  const escena = componerSala(plan, imagenes, null);
  assert.equal(escena.rgba.length, 960 * 528 * 4);
});

test('cada puerta del lado de la cámara lleva su flecha en el piso; las demás no', () => {
  const plan = planDeSala(salaDe('hospital/pasillo'), MANIFIESTO, 'noche');
  const deCamara = plan.sprites.filter(s => s.puerta?.muro === 'camara');
  assert.equal(deCamara.length, 1);
  assert.deepEqual(plan.flechas.map(f => f.id), deCamara.map(s => s.id));
  const flecha = plan.flechas[0], puerta = deCamara[0];
  assert.equal(flecha.x, puerta.puerta.ancla[0]);
  assert.ok(flecha.y < puerta.y && flecha.y > 400, 'la flecha va en el piso, justo sobre el fragmento de la puerta');
  assert.equal(puerta.capa, 'frente');
});

test('la puerta del muro derecho usa la vista lateral en espejo', () => {
  const plan = planDeSala(salaDe('sintetica/ancha'), MANIFIESTO, 'dia');
  const porId = Object.fromEntries(plan.sprites.map(s => [s.id, s]));
  assert.equal(porId['p-der'].espejo, true);
  assert.equal(porId['p-izq'].espejo, false);
  assert.equal(porId['p-der'].ruta, MANIFIESTO.piezas['puerta/paso'].vistas.lado['1920'].ruta);
  assert.equal(porId['p-fondo'].ruta, MANIFIESTO.piezas['puerta/corrediza'].vistas.frente.ruta);
  assert.equal(porId['p-cam'].ruta, MANIFIESTO.piezas['puerta/vidrio'].vistas.camara.ruta);
});

test('la ventana cambia de cuadro con el momento y la lámpara con encendida', () => {
  const cuadros = momento => Object.fromEntries(planDeSala(salaDe('sintetica/ancha'), MANIFIESTO, momento).sprites.map(s => [s.id, s.cuadro]));
  const dia = cuadros('dia'), noche = cuadros('noche');
  assert.deepEqual([dia['v-fondo'], noche['v-fondo']], [0, 1]);
  assert.deepEqual([dia['colgante'], noche['colgante']], [0, 1]);
  assert.deepEqual([dia['pie'], noche['pie']], [1, 1], 'encendida: siempre');
  assert.deepEqual([dia['apagada'], noche['apagada']], [0, 0], 'encendida: nunca');
  assert.deepEqual([dia['reloj'], noche['reloj']], [0, 0], 'el reloj lo anima su fps');
});

test('rutasDelPlan lista cada imagen una sola vez', () => {
  const rutas = rutasDelPlan(planDeSala(salaDe('hospital/pasillo'), MANIFIESTO, 'noche'));
  assert.equal(new Set(rutas).size, rutas.length);
  assert.ok(rutas.includes('piezas/pisos/vinilo-a.png'));
});

test('un ancho fuera del catálogo se rechaza', () => {
  const sala = base();
  sala.estructura.ancho = 1000;
  assert.throws(() => planDe(sala), /fuera del catálogo/);
});
