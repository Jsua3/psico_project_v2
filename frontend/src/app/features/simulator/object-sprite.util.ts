/**
 * Sprites pixel-art de las herramientas clínicas del mapa.
 *
 * Reemplazan el marcador abstracto (`buildToolMarker`: badge de color + código)
 * por un ítem reconocible. Si un `toolCode` no tiene sprite (o el asset no cargó),
 * el resolver devuelve `null` y el marcador cae al badge — degradación elegante.
 */

/** tool_code → nombre base del asset en `assets/game/objects/`. */
const TOOL_SPRITE: Record<string, string> = {
  PAP: 'tool_pap',
  SPIKES: 'tool_spikes',
  REFLECTION_JOURNAL: 'tool_reflection_journal',
  SAFETY_ROUTE: 'tool_safety_route',
  RISK_METER: 'tool_risk_meter',
};

/** Clave de textura Phaser para un sprite de herramienta. */
export function toolSpriteTextureKey(assetName: string): string {
  return `object-${assetName}`;
}

/** Lista de { textureKey, assetPath } para precargar todos los sprites de herramienta. */
export function toolSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return Object.values(TOOL_SPRITE).map(name => ({
    textureKey: toolSpriteTextureKey(name),
    assetPath: `/assets/game/objects/${name}.png`,
  }));
}

/** Ruta del sprite para un `toolCode`, o `null` si no hay (→ fallback al badge). */
export function resolveToolSprite(toolCode: string | null | undefined): string | null {
  if (!toolCode) return null;
  const name = TOOL_SPRITE[toolCode];
  return name ? `/assets/game/objects/${name}.png` : null;
}

/** Clave de textura Phaser para un `toolCode`, o `null` si no hay sprite. */
export function resolveToolTextureKey(toolCode: string | null | undefined): string | null {
  if (!toolCode) return null;
  const name = TOOL_SPRITE[toolCode];
  return name ? toolSpriteTextureKey(name) : null;
}
