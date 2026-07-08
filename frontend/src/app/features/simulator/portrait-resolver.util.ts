/**
 * Resuelve el retrato pixel-art de un NPC de diálogo a partir del `portraitKey`
 * (sembrado en `dialogue_trees`) y la `emotion` de la línea actual.
 *
 * Devuelve la ruta del asset si existe un retrato para ese personaje, o `null`
 * si no hay retrato mapeado — en cuyo caso el panel cae a la silueta SVG.
 *
 * Spike 2026-07-08: solo la sobreviviente (`paciente-vbg`) tiene retratos.
 */

/** portraitKey del diálogo → slug del personaje con assets de retrato. */
const PORTRAIT_KEY_TO_SLUG: Record<string, string> = {
  'escucha-segura': 'paciente-vbg',
  'sobreviviente-consulta': 'paciente-vbg',
};

/** emotion del DialogueState → variante de retrato disponible. */
const EMOTION_TO_VARIANT: Record<string, string> = {
  concerned: 'worried',
  danger: 'sad',
  positive: 'neutral', // aún no hay retrato "happy"; se usa neutral
  neutral: 'neutral',
};

const DEFAULT_VARIANT = 'neutral';

export function resolvePortraitAsset(
  portraitKey: string | null | undefined,
  emotion: string | null | undefined,
): string | null {
  if (!portraitKey) return null;
  const slug = PORTRAIT_KEY_TO_SLUG[portraitKey];
  if (!slug) return null;
  const variant = EMOTION_TO_VARIANT[emotion ?? DEFAULT_VARIANT] ?? DEFAULT_VARIANT;
  return `/assets/characters/portraits/${slug}_${variant}.png`;
}
