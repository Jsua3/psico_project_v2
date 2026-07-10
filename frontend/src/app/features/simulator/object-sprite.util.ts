/**
 * Sprites pixel-art de los objetos del mapa (herramientas y objetos de escenario).
 *
 * Reemplazan los marcadores abstractos (`buildToolMarker`: badge + código; o el
 * tile genérico de `dungeon-tiles` para los OBJECT) por un ítem reconocible. Si
 * un objeto no tiene sprite (o el asset no cargó), el resolver devuelve `null` y
 * el marcador cae a su representación previa — degradación elegante.
 */

/** tool_code → nombre base del asset (herramientas que el jugador recoge). */
const TOOL_SPRITE: Record<string, string> = {
  PAP: 'tool_pap',
  SPIKES: 'tool_spikes',
  REFLECTION_JOURNAL: 'tool_reflection_journal',
  SAFETY_ROUTE: 'tool_safety_route',
  RISK_METER: 'tool_risk_meter',
};

/** short_code → nombre base del asset (objetos de escenario interactivos, tipo OBJECT). */
const OBJECT_SPRITE: Record<string, string> = {
  EXP: 'object_expediente',
  LEY: 'object_marco_normativo',
  REG: 'object_registro',
  RES: 'object_acceso_restringido',
  FIN: 'object_cierre',
};

/** Clave de textura Phaser para un sprite de objeto. */
export function objectTextureKey(assetName: string): string {
  return `object-${assetName}`;
}

/** { textureKey, assetPath } de todos los sprites (herramientas + escenario) para precargar. */
export function objectSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return [...Object.values(TOOL_SPRITE), ...Object.values(OBJECT_SPRITE)].map(name => ({
    textureKey: objectTextureKey(name),
    assetPath: `/assets/game/objects/${name}.png`,
  }));
}

/** Ruta del sprite para un `toolCode`, o `null` si no hay (→ fallback al badge). */
export function resolveToolSprite(toolCode: string | null | undefined): string | null {
  if (!toolCode) return null;
  const name = TOOL_SPRITE[toolCode];
  return name ? `/assets/game/objects/${name}.png` : null;
}

/** Clave de textura Phaser para un `toolCode` (TOOL), o `null`. */
export function resolveToolTextureKey(toolCode: string | null | undefined): string | null {
  if (!toolCode) return null;
  const name = TOOL_SPRITE[toolCode];
  return name ? objectTextureKey(name) : null;
}

/** Clave de textura Phaser para un `shortCode` (OBJECT de escenario), o `null`. */
export function resolveObjectTextureKey(shortCode: string | null | undefined): string | null {
  if (!shortCode) return null;
  const name = OBJECT_SPRITE[shortCode];
  return name ? objectTextureKey(name) : null;
}
