/**
 * Cámara del juego (bloque M1): decide dónde mira y a qué zoom, sin Phaser.
 *
 * Entra la posición del personaje, la sala, la vista física y el momento del juego; sale el centro de la cámara
 * (en px de mundo) y su zoom. La escena aplica el resultado cada cuadro (`objetivoCamara` + `avanzarCamara`).
 *
 * - Vista normal: la escala de siempre (`integerZoom`, spec §8.3), calculada con un ancho de 960 aunque la sala sea
 *   más ancha: una sala ancha se ve igual de cerca y se recorre (§5.1).
 * - Vista cercana: un zoom entero mayor, para leer caras y gestos. La usan los tres momentos automáticos (hablar,
 *   revisar y la reacción) y la tecla Z. Entera en reposo: todos los píxeles miden lo mismo.
 * - Zona muerta central al explorar: la cámara no se mueve mientras el personaje está cerca del centro.
 * - El cuadro de diálogo puede tapar una franja inferior del lienzo: el encuadre se hace en lo que queda libre, y la
 *   sala se alarga hacia abajo lo que tapa el panel para que nadie quede detrás.
 */
import { integerZoom } from '../pixel-scale.util';

/** Ancho con el que se calcula la vista normal: el de la sala de siempre. */
export const ANCHO_REFERENCIA = 960;
/** Px CSS por píxel de mundo a los que apunta la vista cercana: la escala de la maqueta «Sala viva» en la que se leen las caras. */
export const CERCA_CSS = 2;
/** Mundo mínimo (px) que la vista cercana deja ver libre del cuadro de diálogo: dos personas con margen. */
export const MIN_CERCA = { ancho: 320, alto: 176 } as const;
/** Fracción del mundo visible, en cada eje, que ocupa la zona muerta al explorar. */
export const ZONA_MUERTA = 0.2;
/** La cámara mira este tanto por encima de los pies de una persona: el centro del cuerpo, no el piso. */
export const FOCO_PERSONA = 34;
/** Y por encima de la base de un objeto. */
export const FOCO_OBJETO = 16;
/** Margen alrededor de los cuerpos al encuadrar a dos personas. */
export const MARGEN = 24;
/** Medio ancho y alto del cuadro de un personaje del kit (48 × 72). */
export const MEDIO_CUERPO = 24;
export const ALTO_CUERPO = 72;
/** Suavidad de la maqueta: cada cuadro recorre 1 − e^(−TASA·dt) de lo que falta (dt en segundos). */
export const TASA = 6;

export interface Punto { x: number; y: number }

/** Lienzo en px físicos (cam.width/height), su devicePixelRatio y la franja inferior tapada por el cuadro de diálogo (px físicos). */
export interface Vista { ancho: number; alto: number; dpr: number; cubiertoAbajo: number }

export interface Sala { ancho: number; alto: number }

export type Momento =
  | { tipo: 'explorar' }
  /** Hablar y decidir con una persona, y su reacción a una respuesta: `con` son sus pies. */
  | { tipo: 'conversacion'; con: Punto }
  /** Revisar un objeto: `en` es su base. */
  | { tipo: 'objeto'; en: Punto };

export interface EntradaCamara {
  /** Pies del personaje del estudiante. */
  jugador: Punto;
  sala: Sala;
  vista: Vista;
  momento: Momento;
  /** Vista cercana manual (tecla Z). */
  cercana: boolean;
  /** Acercamiento automático en los momentos (ajuste; encendido por defecto). */
  acercarAuto: boolean;
}

export interface EstadoCamara { centro: Punto; zoom: number }

function libre(vista: Vista): number {
  return Math.max(0, vista.alto - Math.max(0, vista.cubiertoAbajo));
}

/** Zoom entero de la vista normal: el de siempre, con la sala tomada como de 960 de ancho a lo sumo. */
export function zoomNormal(vista: Vista, sala: Sala): number {
  return integerZoom(vista.ancho, vista.alto, Math.min(sala.ancho, ANCHO_REFERENCIA), sala.alto);
}

/**
 * Zoom entero de la vista cercana: al menos uno más que el normal y cerca de `CERCA_CSS` px CSS por píxel de mundo,
 * sin dejar ver menos de `MIN_CERCA` libre del cuadro de diálogo. Si ni un paso más cabe, el normal.
 */
export function zoomCercano(vista: Vista, normal: number): number {
  const dpr = Number.isFinite(vista.dpr) && vista.dpr > 0 ? vista.dpr : 1;
  const tope = Math.min(Math.floor(vista.ancho / MIN_CERCA.ancho), Math.floor(libre(vista) / MIN_CERCA.alto));
  const deseado = Math.max(normal + 1, Math.round(CERCA_CSS * dpr));
  const k = Math.min(deseado, tope);
  return k > normal ? k : normal;
}

/** El mayor zoom entre `desde` y `minimo` (de a uno hacia abajo) en el que un recuadro de mundo cabe en lo libre de la vista. */
function mayorQueCabe(desde: number, minimo: number, ancho: number, alto: number, vista: Vista): number {
  for (let k = desde; k > minimo; k--) {
    if (ancho * k <= vista.ancho && alto * k <= libre(vista)) return k;
  }
  return minimo;
}

/** Mueve `centro` lo justo para que `foco` quede a menos de `margen` de él. */
function seguir(centro: number, foco: number, margen: number): number {
  if (foco > centro + margen) return foco - margen;
  if (foco < centro - margen) return foco + margen;
  return centro;
}

/** Recorta un centro para que la ventana de medio tamaño `mitad` no salga de [min, max]; si no cabe, el centro del tramo. */
function limitar(centro: number, mitad: number, min: number, max: number): number {
  if (max - min <= 2 * mitad) return (min + max) / 2;
  return Math.min(max - mitad, Math.max(min + mitad, centro));
}

/** Dónde debe mirar la cámara y con qué zoom. `previo` es el estado actual (para la zona muerta); null en un corte. */
export function objetivoCamara(e: EntradaCamara, previo: EstadoCamara | null): EstadoCamara {
  const { vista, sala, momento, jugador } = e;
  const normal = zoomNormal(vista, sala);
  const cercano = zoomCercano(vista, normal);
  const base = e.cercana ? cercano : normal;

  let zoom = base;
  let foco: Punto;
  if (momento.tipo === 'conversacion') {
    const otro = momento.con;
    foco = { x: (jugador.x + otro.x) / 2, y: (jugador.y + otro.y) / 2 - FOCO_PERSONA };
    if (e.acercarAuto) {
      const ancho = Math.abs(otro.x - jugador.x) + 2 * (MEDIO_CUERPO + MARGEN);
      const alto = Math.abs(otro.y - jugador.y) + ALTO_CUERPO + 2 * MARGEN;
      zoom = mayorQueCabe(cercano, base, ancho, alto, vista);
    }
  } else if (momento.tipo === 'objeto') {
    foco = { x: momento.en.x, y: momento.en.y - FOCO_OBJETO };
    if (e.acercarAuto) zoom = cercano;
  } else {
    foco = { x: jugador.x, y: jugador.y - FOCO_PERSONA };
  }

  const visibleAncho = vista.ancho / zoom;
  const visibleAlto = vista.alto / zoom;
  const tapado = Math.max(0, vista.cubiertoAbajo) / zoom;

  // El foco va al centro de lo que el cuadro de diálogo deja libre.
  let x = foco.x;
  let y = foco.y + tapado / 2;
  if (momento.tipo === 'explorar' && previo) {
    x = seguir(previo.centro.x, foco.x, (ZONA_MUERTA * visibleAncho) / 2);
    y = seguir(previo.centro.y - tapado / 2, foco.y, (ZONA_MUERTA * (visibleAlto - tapado)) / 2) + tapado / 2;
  }

  return {
    centro: {
      x: limitar(x, visibleAncho / 2, 0, sala.ancho),
      y: limitar(y, visibleAlto / 2, 0, sala.alto + tapado),
    },
    zoom,
  };
}

/** Ya llegó: el zoom a menos de una centésima y el centro a menos de medio píxel. */
export function asentada(actual: EstadoCamara, objetivo: EstadoCamara): boolean {
  return Math.abs(actual.zoom - objetivo.zoom) < 0.01
    && Math.hypot(actual.centro.x - objetivo.centro.x, actual.centro.y - objetivo.centro.y) < 0.5;
}

/**
 * Un cuadro hacia el objetivo con la suavidad de la maqueta. Con movimiento reducido, o tras una pausa de un segundo
 * o más (pestaña oculta), es un corte. Al asentarse devuelve el objetivo exacto: en reposo el zoom es entero.
 */
export function avanzarCamara(actual: EstadoCamara, objetivo: EstadoCamara, dtMs: number, reducido: boolean): EstadoCamara {
  const exacto = { centro: { ...objetivo.centro }, zoom: objetivo.zoom };
  if (reducido || dtMs >= 1000) return exacto;
  if (!(dtMs > 0)) return actual;
  const f = 1 - Math.exp((-TASA * dtMs) / 1000);
  const siguiente: EstadoCamara = {
    centro: {
      x: actual.centro.x + (objetivo.centro.x - actual.centro.x) * f,
      y: actual.centro.y + (objetivo.centro.y - actual.centro.y) * f,
    },
    zoom: actual.zoom + (objetivo.zoom - actual.zoom) * f,
  };
  return asentada(siguiente, objetivo) ? exacto : siguiente;
}
