/**
 * Elenco horneado: personajes completos (pelo + ropa + cara integrados) en hojas
 * con el MISMO contrato del sistema modular 2× — 384×576, 3 columnas de caminata
 * × 3 filas de dirección (frente / lado-derecha / espalda), frames de 128×192,
 * pies en y≈180. Al compartir contrato, una hoja horneada es un drop-in para
 * las animaciones existentes (idle col 0, ping-pong [1,0,2,0], flip izquierda).
 *
 * Las hojas se producen con `tools/cast-assets/harvest_cast_sheet.py` a partir
 * de generaciones de Higgsfield (ver README de esa carpeta). Si una hoja falta
 * o no cargó, el resolver devuelve `null` y el jugador/NPC cae al sistema
 * modular por capas — degradación elegante, como todo el arte del mapa.
 */

export interface CastMember {
  /** Id estable (nombre de asset y clave de textura). */
  id: string;
  /** Nombre visible en el selector del editor. */
  label: string;
}

/** Personajes jugables (el editor los ofrece como "elige tu personaje"). */
export const PLAYABLE_CAST: readonly CastMember[] = [
  { id: 'valentina', label: 'Valentina' },
  { id: 'andres', label: 'Andrés' },
  { id: 'camila', label: 'Camila' },
  { id: 'daniela', label: 'Daniela' },
  { id: 'jorge', label: 'Jorge' },
  { id: 'luisa', label: 'Luisa' },
  { id: 'mateo', label: 'Mateo' },
  { id: 'samuel', label: 'Samuel' },
];

/**
 * Hojas horneadas de NPCs del caso, por clave de preset. Se llena a medida que
 * se hornean; un preset sin entrada sigue usando su composición modular.
 */
export const NPC_CAST: Readonly<Partial<Record<string, string>>> = {};

/** Clave de textura Phaser de un miembro del elenco. */
export function castTextureKey(id: string): string {
  return `cast-${id}`;
}

/** Ruta del asset de la hoja de un miembro del elenco. */
export function castAssetPath(id: string): string {
  return `/assets/characters/cast/${id}.png`;
}

/** Ids de todas las hojas a precargar (jugables + NPCs horneados). */
export function castSheetIds(): string[] {
  return [...PLAYABLE_CAST.map(m => m.id), ...Object.values(NPC_CAST) as string[]];
}

/** `castId` válido del elenco jugable, o `null` (→ fallback modular). */
export function resolveCastId(castId: string | null | undefined): string | null {
  if (!castId) return null;
  return PLAYABLE_CAST.some(m => m.id === castId) ? castId : null;
}

/** Hoja horneada del preset de NPC, o `null` (→ composición modular). */
export function npcCastSheetId(presetKey: string | null | undefined): string | null {
  if (!presetKey) return null;
  return NPC_CAST[presetKey] ?? null;
}
