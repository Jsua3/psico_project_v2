/**
 * Geometría de las salas de la biblioteca (contrato `.superpowers/contratos/x-siep-2.2.md`, sección 1).
 *
 * Alto de 528 px y ancho de 960 a 1920 (ANCHOS). La fuente es el servidor
 * (`backend_django/apps/biblioteca/services/geometria.py`); esta copia y la del editor
 * (`frontend/src/app/features/autoria/modelo/geometria.ts`) reproducen su tabla dorada
 * (`biblioteca/esquema/geometria-salas.json`; la prueba es `geometria.test.mjs`). Aritmética
 * entera con `redondear` (mitades hacia +∞). A 960 px la zona es la tabla fija de antes:
 * x 96–864 e y 236–486 con tres paredes; sin pared lateral, el borde se abre hasta 24 px del lienzo.
 */

export const ANCHOS = Object.freeze([960, 1200, 1440, 1680, 1920]);
export const ANCHO_SALA = 960;
export const ALTO_SALA = 528;
export const PISO = 230;
export const FONDO = ALTO_SALA - PISO;
const MARGEN = 24;
const ZONA_Y = 236;
const ZONA_ALTO = 250;
const LLEGADA_X = 16;
const LLEGADA_ARRIBA = 24;
const LLEGADA_ABAJO = 10;

export const MUROS = Object.freeze(['fondo', 'izquierda', 'derecha', 'camara']);

/** Lado de la caja que se reserva libre alrededor de la entrada y de cada puerta. */
export const LADO_PASO_LIBRE = 32;

/** ¿Tiene muro a la izquierda / a la derecha? */
const LATERALES = Object.freeze({
  'tres-paredes': [true, true],
  'dos-paredes-izquierda': [true, false],
  'dos-paredes-derecha': [false, true],
  'una-pared': [false, false],
});

export const ENCUADRES = Object.freeze(Object.keys(LATERALES));

function lateralesDe(encuadre) {
  const lados = LATERALES[encuadre];
  if (!lados) throw new Error(`Encuadre desconocido: ${encuadre}`);
  return lados;
}

/** n / d al entero más cercano, con las mitades hacia +∞. */
export function redondear(n, d) {
  return Math.floor((2 * n + d) / (2 * d));
}

/** x donde un muro lateral se junta con el del fondo: 96 a 960 px … 172 a 1920 px. */
export function borde(ancho) {
  if (!ANCHOS.includes(ancho)) throw new Error(`Ancho fuera del catálogo: ${ancho}`);
  return 96 + Math.floor((19 * (ancho - 960)) / 240);
}

/** [xl, xr]: los extremos del muro del fondo. */
export function limites(encuadre, ancho = ANCHO_SALA) {
  const [izquierda, derecha] = lateralesDe(encuadre);
  const b = borde(ancho);
  return [izquierda ? b : 0, derecha ? ancho - b : ancho];
}

/** Zona caminable del encuadre, en px de sala. */
export function zonaCaminable(encuadre, ancho = ANCHO_SALA) {
  const [izquierda, derecha] = lateralesDe(encuadre);
  const b = borde(ancho);
  const x0 = izquierda ? b : MARGEN;
  const x1 = derecha ? ancho - b : ancho - MARGEN;
  return { x: x0, y: ZONA_Y, ancho: x1 - x0, alto: ZONA_ALTO };
}

/** Largo del muro en px; 0 si el encuadre no lo tiene. */
export function largoMuro(muro, encuadre, ancho = ANCHO_SALA) {
  const [izquierda, derecha] = lateralesDe(encuadre);
  if (muro === 'fondo' || muro === 'camara') {
    const [xl, xr] = limites(encuadre, ancho);
    return xr - xl;
  }
  if (muro === 'izquierda') return izquierda ? FONDO : 0;
  if (muro === 'derecha') return derecha ? FONDO : 0;
  throw new Error(`Muro desconocido: ${muro}`);
}

/** Punto de apoyo en pantalla de una pieza puesta en (muro, pos). */
export function ancla(muro, pos, encuadre, ancho = ANCHO_SALA) {
  const [xl] = limites(encuadre, ancho);
  if (muro === 'fondo') return { x: xl + pos, y: PISO };
  if (muro === 'camara') {
    const centro = Math.floor(ancho / 2);
    return { x: centro + redondear((xl + pos - centro) * 19, 16), y: ALTO_SALA };
  }
  if (muro !== 'izquierda' && muro !== 'derecha') throw new Error(`Muro desconocido: ${muro}`);
  const b = borde(ancho);
  const x = b - redondear(pos * (b - MARGEN), FONDO);
  return { x: muro === 'izquierda' ? x : ancho - x, y: PISO + pos };
}

/** Dónde queda parado el personaje junto a la puerta puesta en (muro, pos). */
export function llegada(muro, pos, encuadre, ancho = ANCHO_SALA) {
  const a = ancla(muro, pos, encuadre, ancho);
  const z = zonaCaminable(encuadre, ancho);
  return {
    x: Math.min(Math.max(a.x, z.x + LLEGADA_X), z.x + z.ancho - LLEGADA_X),
    y: Math.min(Math.max(a.y, z.y + LLEGADA_ARRIBA), z.y + z.alto - LLEGADA_ABAJO),
  };
}

/** Lo que queda fuera de la zona caminable: fondo, izquierda, derecha, delantero. */
export function paredes(encuadre, ancho = ANCHO_SALA) {
  const z = zonaCaminable(encuadre, ancho);
  const [conIzquierda, conDerecha] = lateralesDe(encuadre);
  const derecha = z.x + z.ancho;
  const resultado = [{ clave: 'pared-fondo', x: 0, y: 0, ancho, alto: z.y }];
  if (z.x > 0) {
    resultado.push({ clave: conIzquierda ? 'pared-izquierda' : 'borde-izquierdo', x: 0, y: z.y, ancho: z.x, alto: z.alto });
  }
  if (derecha < ancho) {
    resultado.push({
      clave: conDerecha ? 'pared-derecha' : 'borde-derecho', x: derecha, y: z.y, ancho: ancho - derecha, alto: z.alto,
    });
  }
  if (z.y + z.alto < ALTO_SALA) {
    resultado.push({ clave: 'borde-delantero', x: 0, y: z.y + z.alto, ancho, alto: ALTO_SALA - (z.y + z.alto) });
  }
  return resultado;
}

/** ¿Se tocan dos rectángulos { x, y, ancho, alto }? Compartir solo un borde no cuenta. */
export function rectIntersecta(a, b) {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;
}

/** Caja de colisión de un mueble apoyado en (x, y): centro inferior. */
export function cajaDeMueble(x, y, ancho, alto) {
  return { x: x - ancho / 2, y: y - alto, ancho, alto };
}

/** Caja cuadrada centrada en un punto (entrada o puerta). */
export function cajaCentrada(x, y, lado = LADO_PASO_LIBRE) {
  return { x: x - lado / 2, y: y - lado / 2, ancho: lado, alto: lado };
}

/** ¿Está el punto dentro de la zona (bordes incluidos)? */
export function puntoEnZona(zona, x, y) {
  return x >= zona.x && x <= zona.x + zona.ancho && y >= zona.y && y <= zona.y + zona.alto;
}

/**
 * ¿Cabe el mueble en la zona? Su caja debe quedar dentro a lo ancho y su punto
 * de apoyo dentro a lo alto; la caja sí puede subir sobre la pared del fondo,
 * porque un mueble arrimado a esa pared la tapa en la vista frontal.
 */
export function muebleEnZona(zona, caja) {
  const base = caja.y + caja.alto;
  return (
    caja.x >= zona.x &&
    caja.x + caja.ancho <= zona.x + zona.ancho &&
    base >= zona.y &&
    base <= zona.y + zona.alto
  );
}
