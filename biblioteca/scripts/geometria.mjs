/**
 * Geometría de las salas de la biblioteca.
 *
 * Lienzo de sala: 960 × 528 px, igual que AUTHORED_ROOM_WIDTH/HEIGHT del juego
 * (frontend/src/app/features/simulator/authored-clinical-room.util.ts).
 * Las bandas de pared del juego dejan caminable x 96–864, y 236–486 con tres
 * paredes (case-pdf-rooms.geometry.ts). Sin pared lateral, el borde de esa
 * pared se abre hasta 24 px del lienzo.
 */

export const ANCHO_SALA = 960;
export const ALTO_SALA = 528;

/** Lado de la caja que se reserva libre alrededor de la entrada y de cada puerta. */
export const LADO_PASO_LIBRE = 32;

const ZONAS = Object.freeze({
  'tres-paredes': { x: 96, y: 236, ancho: 768, alto: 250 },
  'dos-paredes-izquierda': { x: 96, y: 236, ancho: 840, alto: 250 },
  'dos-paredes-derecha': { x: 24, y: 236, ancho: 840, alto: 250 },
  'una-pared': { x: 24, y: 236, ancho: 912, alto: 250 },
});

export const ENCUADRES = Object.freeze(Object.keys(ZONAS));

/** Zona caminable del encuadre, en px de sala. */
export function zonaCaminable(encuadre) {
  const zona = ZONAS[encuadre];
  if (!zona) throw new Error(`Encuadre desconocido: ${encuadre}`);
  return { ...zona };
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
