/**
 * Geometría de las salas, copiada de P1 (`biblioteca/scripts/geometria.mjs`): lienzo de
 * 960 × 528 y zona caminable por encuadre. Si cambia allá, cambia aquí.
 *
 * Es también la fuente que lee el juego (`simulator/room-ambient.util.ts`) para que las personas que deambulan no salgan de la
 * zona; el servidor lleva la misma tabla (`apps/biblioteca/services/geometria.py`) y sus paredes las levanta la copia al caso.
 * `test_geometria_encuadres.py` falla si las cuatro divergen.
 */
import type { Encuadre } from './escenario';

export const ANCHO_SALA = 960;
export const ALTO_SALA = 528;

export interface Zona {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

const ZONAS: Record<Encuadre, Zona> = {
  'tres-paredes': { x: 96, y: 236, ancho: 768, alto: 250 },
  'dos-paredes-izquierda': { x: 96, y: 236, ancho: 840, alto: 250 },
  'dos-paredes-derecha': { x: 24, y: 236, ancho: 840, alto: 250 },
  'una-pared': { x: 24, y: 236, ancho: 912, alto: 250 },
};

/** ¿Es el nombre de un encuadre que conocemos? (el juego lo lee de un registro libre, así que no se fía del tipo). */
export function esEncuadre(valor: unknown): valor is Encuadre {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ZONAS, valor);
}

export function zonaCaminable(encuadre: Encuadre): Zona {
  return { ...ZONAS[encuadre] };
}

const limitar = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

/**
 * Lleva un punto de apoyo al borde de la zona si se sale. `medioAncho` es la mitad del ancho
 * de la caja de un mueble: así el mueble entero queda dentro, como pide el validador de P1.
 */
export function limitarAZona(zona: Zona, x: number, y: number, medioAncho = 0): { x: number; y: number } {
  return {
    x: limitar(x, zona.x + medioAncho, zona.x + zona.ancho - medioAncho),
    y: limitar(y, zona.y, zona.y + zona.alto),
  };
}

export function centroDeZona(zona: Zona): { x: number; y: number } {
  return { x: Math.round(zona.x + zona.ancho / 2), y: Math.round(zona.y + zona.alto / 2) };
}
