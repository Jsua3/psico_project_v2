import { ROUTE_ORDER, RoomGroup } from './orientation.config';

/**
 * Salas ya alcanzadas en un intento: refuerzo de la regla monótona de deriveSceneLog (la lista es
 * correcta tras F5 aunque no haya nada guardado; esto cubre el caso de volver a una sala anterior).
 * `sessionStorage` bajo una clave APARTE de `siep_attempt_*` (que tienen tres escritores), con
 * try/catch y respaldo en memoria. No guarda más que nombres de sala.
 */
const memory = new Map<string, Set<RoomGroup>>();

export function visitedRoomsKey(caseVersionId: string | number, attemptId: string): string {
  return `siep_rooms_${caseVersionId}_${attemptId}`;
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // acceder a sessionStorage puede lanzar SecurityError
  }
}

function parseRooms(raw: string | null): RoomGroup[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data)
      ? data.filter((room): room is RoomGroup => ROUTE_ORDER.includes(room as RoomGroup))
      : [];
  } catch {
    return [];
  }
}

export function readVisitedRooms(
  caseVersionId: string | number, attemptId: string, storage?: Pick<Storage, 'getItem'>,
): ReadonlySet<RoomGroup> {
  const key = visitedRoomsKey(caseVersionId, attemptId);
  const rooms = new Set<RoomGroup>(memory.get(key));
  try {
    const source = storage ?? defaultStorage();
    for (const room of parseRooms(source ? source.getItem(key) : null)) rooms.add(room);
  } catch {
    // Sin lectura: vale lo recordado en memoria.
  }
  return rooms;
}

/** Marca una sala como alcanzada y devuelve el conjunto actualizado (mismo contenido si ya estaba). */
export function markRoomVisited(
  caseVersionId: string | number, attemptId: string, room: RoomGroup, storage?: Pick<Storage, 'getItem' | 'setItem'>,
): ReadonlySet<RoomGroup> {
  const current = readVisitedRooms(caseVersionId, attemptId, storage);
  if (current.has(room)) return current;
  const rooms = new Set(current).add(room);
  const key = visitedRoomsKey(caseVersionId, attemptId);
  memory.set(key, new Set(rooms));
  try {
    const target = storage ?? defaultStorage();
    target?.setItem(key, JSON.stringify([...rooms]));
  } catch {
    // La memoria ya lo tiene: dura lo que dura la pestaña.
  }
  return rooms;
}

/** Olvida las salas de un intento (intento nuevo o cierre de sesión). */
export function clearVisitedRooms(
  caseVersionId: string | number, attemptId: string, storage?: Pick<Storage, 'removeItem'>,
): void {
  const key = visitedRoomsKey(caseVersionId, attemptId);
  memory.delete(key);
  try {
    (storage ?? defaultStorage())?.removeItem(key);
  } catch {
    // Nada que borrar si el almacenamiento no responde.
  }
}
