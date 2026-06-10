/**
 * Sala clínica autoría (vertical slice urgencias-crisis).
 *
 * La sala se dibuja proceduralmente en game-world (renderAuthoredClinicalOffice)
 * sobre un lienzo de 960×528. Este helper centraliza la geometría jugable:
 * colisiones, posiciones de marcadores backend y de NPCs, para que el render y
 * el gameplay compartan una sola fuente de verdad.
 */

const AUTHORED_CLINICAL_ROOM_KEYS = new Set([
  'urgencias-crisis',
  'urgencias-sala',
  'map-urgencias-sala',
  'ruta-sala',
  'map-ruta-sala',
  'informe-oficina',
  'map-informe-oficina',
  'nna-sala',
  'map-nna-sala',
  'cierre-sala',
  'map-cierre-sala',
]);

export function isAuthoredClinicalRoomKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && AUTHORED_CLINICAL_ROOM_KEYS.has(key);
}

export interface RoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AUTHORED_ROOM_WIDTH = 960;
export const AUTHORED_ROOM_HEIGHT = 528;

/** Punto de aparición del jugador (centro-frente de la sala). */
export const AUTHORED_PLAYER_SPAWN = { x: 480, y: 420 } as const;

/**
 * Colisiones AABB de la sala autoría: bandas de pared (la zona caminable es el
 * piso trapezoidal entre y≈240 y y≈486) + mobiliario dibujado en
 * renderAuthoredClinicalOffice (escritorio, sofá, mesa de centro, plantas).
 */
export const AUTHORED_CLINICAL_COLLISIONS: readonly RoomRect[] = [
  { x: 0, y: 0, width: AUTHORED_ROOM_WIDTH, height: 236 },          // pared del fondo
  { x: 0, y: 486, width: AUTHORED_ROOM_WIDTH, height: 60 },         // borde frontal
  { x: 0, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },          // pared izquierda
  { x: 864, y: 0, width: 96, height: AUTHORED_ROOM_HEIGHT },        // pared derecha
  { x: 365, y: 262, width: 270, height: 80 },                       // escritorio (250/270 px en drawDesk)
  { x: 121, y: 288, width: 138, height: 70 },                       // sofá
  { x: 254, y: 353, width: 92, height: 44 },                        // mesa de centro
  { x: 796, y: 366, width: 48, height: 44 },                        // planta derecha
  { x: 92, y: 372, width: 48, height: 44 },                         // planta izquierda
];

/**
 * Posiciones jugables de los puntos interactivos del backend dentro de la sala
 * autoría (las coordenadas originales del seed pertenecen al tilemap viejo).
 * Claves estables del caso urgencias-crisis.
 */
export const AUTHORED_MARKER_POSITIONS: Readonly<Record<string, { x: number; y: number }>> = {
  'escucha-segura':          { x: 168, y: 408 },  // familia junto al sofá
  'cuestionario-prematuro':  { x: 178, y: 268 },  // acceso al área médica (riesgosa)
  'aviso-policial':          { x: 806, y: 296 },  // cartelera de ruta VBG
  'tool-pap':                { x: 318, y: 428 },  // kit PAP frente a la mesa
  'tool-bitacora':           { x: 648, y: 372 },  // bitácora sobre el escritorio
};

/** Posiciones de NPCs en la sala autoría (alcanzables desde el piso). */
export const AUTHORED_NPC_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 736, y: 372 },  // enfermera de turno, frente al escritorio
  { x: 372, y: 430 },  // colega de guardia, en el piso central
];

export function authoredMarkerPosition(key: string): { x: number; y: number } | null {
  return AUTHORED_MARKER_POSITIONS[key] ?? null;
}

/** true si el AABB del jugador (30×46 centrado en x,y) toca alguna colisión. */
export function collidesInAuthoredRoom(x: number, y: number): boolean {
  const left = x - 15, top = y - 27, right = x + 15, bottom = y + 19;
  return AUTHORED_CLINICAL_COLLISIONS.some(z =>
    left < z.x + z.width && right > z.x && top < z.y + z.height && bottom > z.y);
}
