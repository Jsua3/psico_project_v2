export interface Point {
  x: number;
  y: number;
}

export interface Hit {
  kind: 'object' | 'zone';
  key: string;
}

/** Cuántas casillas salta una flecha y cuántas con Mayús. */
const STEP_CELLS = 1;
const STEP_CELLS_SHIFT = 8;
/** Distancia (en unidades del mundo) a la que un punto «toca» a un objeto: el radio de su cuerpo más un margen. */
const OBJECT_REACH = 24;

const ARROWS: Record<string, Point> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
};

/**
 * La posición tras pulsar una flecha (plan F8-5; RNF-04): una casilla, u ocho con Mayús, encajada a la rejilla y sin
 * salir del mapa. `null` si la tecla no es una flecha.
 */
export function moveByKey(
  point: Point,
  key: string,
  shift: boolean,
  grid: number,
  map: { width: number; height: number },
): Point | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const cells = shift ? STEP_CELLS_SHIFT : STEP_CELLS;
  const snap = (value: number): number => Math.round(value / grid) * grid || 0;
  const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));
  return {
    x: clamp(snap(point.x) + direction.x * cells * grid, map.width),
    y: clamp(snap(point.y) + direction.y * cells * grid, map.height),
  };
}

/** Lo que hay bajo `point`: un objeto cuyo centro esté a su alcance (gana) o una zona que lo contenga. */
export function elementAt(
  objects: ReadonlyArray<{ key: string; x: number; y: number }>,
  zones: ReadonlyArray<{ key: string; x: number; y: number; width: number; height: number }>,
  point: Point,
): Hit | null {
  let nearest: { key: string; distance: number } | null = null;
  for (const object of objects) {
    const distance = Math.hypot(object.x - point.x, object.y - point.y);
    if (distance <= OBJECT_REACH && (nearest === null || distance < nearest.distance)) {
      nearest = { key: object.key, distance };
    }
  }
  if (nearest) return { kind: 'object', key: nearest.key };
  const zone = zones.find(candidate =>
    point.x >= candidate.x && point.x <= candidate.x + candidate.width
    && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
  return zone ? { kind: 'zone', key: zone.key } : null;
}

/** El elemento siguiente (o anterior) de la lista, dando la vuelta; sin selección vigente, el primero (o el último). */
export function cycleKey(keys: readonly string[], current: string | null, backwards: boolean): string | null {
  if (keys.length === 0) return null;
  const index = current === null ? -1 : keys.indexOf(current);
  if (index < 0) return backwards ? keys[keys.length - 1] : keys[0];
  const next = (index + (backwards ? -1 : 1) + keys.length) % keys.length;
  return keys[next];
}

/** El rectángulo entre dos esquinas (en cualquier orden); `null` si en algún eje mide menos de una casilla. */
export function zoneBetween(
  a: Point,
  b: Point,
  grid: number,
): { x: number; y: number; width: number; height: number } | null {
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  if (width < grid || height < grid) return null;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width, height };
}
