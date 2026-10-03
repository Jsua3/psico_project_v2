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
 * Variantes que el resolver puede devolver por personaje: SOLO assets que existen en
 * `assets/characters/portraits/` (no existen `madre-vbg_sad`, `psicologa-hospitalaria_worried`
 * ni `paciente-vbg_happy`). `madre-vbg_happy.png` existe en disco pero no se usa: la Abuela en
 * el duelo no sonríe (límite de producto 2). Una variante ausente cae a `neutral`.
 */
const USABLE_VARIANTS: Record<string, readonly string[]> = {
  'madre-vbg': ['neutral', 'worried'],
  'paciente-vbg': ['neutral', 'sad', 'worried'],
  'psicologa-hospitalaria': ['neutral', 'happy'],
  'funcionaria-recepcion': ['neutral'],
  'comisaria-profesional': ['neutral'],
};

/**
 * emotion del DialogueState → variante de retrato (F§7.11). Vocabulario real del seed:
 * `neutral`, `vulnerable`. `positive → happy` solo llega a quien tiene esa variante usable
 * (la psicóloga hospitalaria): ni la Abuela ni la Consultante sonríen.
 */
const EMOTION_TO_VARIANT: Record<string, string> = {
  neutral: 'neutral',
  vulnerable: 'worried',
  concerned: 'worried',
  anxious: 'worried',
  danger: 'sad',
  negative: 'sad',
  sad: 'sad',
  relieved: 'neutral',
  calm: 'neutral',
  positive: 'happy',
};

const DEFAULT_VARIANT = 'neutral';

export function resolvePortraitAsset(
  portraitKey: string | null | undefined,
  emotion: string | null | undefined,
  speakerName?: string | null,
): string | null {
  const slug = (portraitKey && PORTRAIT_KEY_TO_SLUG[portraitKey])
    || (speakerName && SPEAKER_NAME_TO_SLUG[speakerName])
    || null;
  if (!slug) return null;
  const wanted = EMOTION_TO_VARIANT[emotion ?? DEFAULT_VARIANT] ?? DEFAULT_VARIANT;
  const variant = USABLE_VARIANTS[slug]?.includes(wanted) ? wanted : DEFAULT_VARIANT;
  return `/assets/characters/portraits/${slug}_${variant}.png`;
}

/** Hablantes que no son personas: solo ellos conservan chip y etiqueta de emoción en el panel. */
const SYSTEM_VOICES = new Set([
  'Supervisión clínica',
  'Criterio profesional',
  'Herramienta profesional',
  'Intervención',
]);

/**
 * `true` para las voces del sistema (supervisión, criterio profesional, herramientas) y para un
 * hablante sin nombre. Las personas del caso no llevan etiqueta de emoción: rotular el duelo
 * ajeno («receptiva», «alerta») es un juicio que el panel no debe hacer.
 */
export function isSystemVoice(speakerName: string | null | undefined): boolean {
  const name = speakerName?.trim();
  return !name || SYSTEM_VOICES.has(name);
}
