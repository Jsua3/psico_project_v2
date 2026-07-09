/**
 * Resuelve el retrato pixel-art de un NPC de diálogo a partir del `portraitKey`
 * (sembrado en `dialogue_trees`), el `speakerName` y la `emotion` de la línea.
 *
 * Devuelve la ruta del asset si existe un retrato para ese personaje, o `null`
 * si no hay retrato mapeado — en cuyo caso el panel cae a la silueta SVG.
 *
 * Nota (caso PDF sembrado): la mayoría de los NPC-persona traen `portraitKey`
 * nulo, así que el resolver también mapea por `speakerName`. Las emociones
 * reales del diálogo son `neutral`, `vulnerable` (la sobreviviente) y `alerta`
 * (avisos, sin retrato de persona).
 */

/** portraitKey del diálogo → slug del personaje con assets de retrato. */
const PORTRAIT_KEY_TO_SLUG: Record<string, string> = {
  'escucha-segura': 'paciente-vbg',
  'sobreviviente-consulta': 'paciente-vbg',
};

/** speakerName del diálogo → slug (fallback cuando portraitKey es nulo). */
const SPEAKER_NAME_TO_SLUG: Record<string, string> = {
  'Consultante': 'paciente-vbg',
  'Sobreviviente (22 años)': 'paciente-vbg',
  'Abuela de la niña': 'madre-vbg',
  'Funcionaria de recepción': 'funcionaria-recepcion',
  'Psicóloga hospitalaria': 'psicologa-hospitalaria',
  'Profesional psicosocial': 'comisaria-profesional',
};

/**
 * emotion del DialogueState → variante de retrato disponible.
 * Vocabulario real del seed: `neutral`, `vulnerable`. Se conservan
 * `concerned`/`danger`/`positive` por robustez (los define el panel).
 */
const EMOTION_TO_VARIANT: Record<string, string> = {
  neutral: 'neutral',
  vulnerable: 'worried',
  concerned: 'worried',
  danger: 'sad',
  positive: 'neutral', // aún no hay retrato "happy"; se usa neutral
};

const DEFAULT_VARIANT = 'neutral';

/** Slugs que solo tienen retrato neutral (no generamos variantes que su diálogo nunca emite). */
const NEUTRAL_ONLY_SLUGS = new Set([
  'madre-vbg',
  'funcionaria-recepcion',
  'psicologa-hospitalaria',
  'comisaria-profesional',
]);

export function resolvePortraitAsset(
  portraitKey: string | null | undefined,
  emotion: string | null | undefined,
  speakerName?: string | null,
): string | null {
  const slug = (portraitKey && PORTRAIT_KEY_TO_SLUG[portraitKey])
    || (speakerName && SPEAKER_NAME_TO_SLUG[speakerName])
    || null;
  if (!slug) return null;
  let variant = EMOTION_TO_VARIANT[emotion ?? DEFAULT_VARIANT] ?? DEFAULT_VARIANT;
  if (NEUTRAL_ONLY_SLUGS.has(slug)) variant = 'neutral';
  return `/assets/characters/portraits/${slug}_${variant}.png`;
}
