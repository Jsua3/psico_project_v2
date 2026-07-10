/**
 * Sprites pixel-art de las puertas (objetos `EXIT` del mapa).
 *
 * Reemplazan las dos representaciones previas —la puerta dibujada de las salas
 * de autoría (marco + hoja + pomo) y el tile `DOOR` de Kenney— por una puerta
 * propia por destino. Si el asset no cargó, el resolver devuelve `null` y el
 * marcador cae a su representación previa — degradación elegante.
 *
 * Se indexa por `object.key` y no por `shortCode` como TOOL/OBJECT: el seed no
 * define `short` para las puertas, así que todas comparten `short_code = "EXIT"`.
 */

/** object_key → nombre base del asset. Las puertas son retrato (48×64). */
const DOOR_SPRITE: Record<string, string> = {
  'puerta-urgencias': 'door_urgencias',
  'salida-institucional': 'door_salida_institucional',
  'puerta-recepcion': 'door_recepcion',
  'puerta-sala-escucha': 'door_sala_escucha',
  'puerta-consultorio': 'door_consultorio',
};

/** Clave de textura Phaser para un sprite de puerta. */
export function doorTextureKey(assetName: string): string {
  return `door-${assetName}`;
}

/** { textureKey, assetPath } de todas las puertas, para precargar. */
export function doorSpriteSpecs(): { textureKey: string; assetPath: string }[] {
  return Object.values(DOOR_SPRITE).map(name => ({
    textureKey: doorTextureKey(name),
    assetPath: `/assets/game/doors/${name}.png`,
  }));
}

/** Clave de textura Phaser para un `objectKey` de puerta, o `null` (→ fallback). */
export function resolveDoorTextureKey(objectKey: string | null | undefined): string | null {
  if (!objectKey) return null;
  const name = DOOR_SPRITE[objectKey];
  return name ? doorTextureKey(name) : null;
}
