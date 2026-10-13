/**
 * Textos en BORRADOR de la pantalla de juego (plan visual §9, decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23
 * y VD-24). Ninguno es texto validado: viven aquí, juntos, cada uno con su decisión, su responsable y dónde se usa,
 * para poder listarlos al usuario y cambiarlos en un solo sitio cuando Psicología fije la redacción definitiva.
 * Los textos YA validados (aviso de contenido, pausa, reintentos, opciones, ayuda…) no pasan por aquí: no se tocan.
 */
export interface DraftCopyEntry {
  /** Decisión del plan visual que lo origina (§9). */
  readonly decision: `VD-${number}`;
  /** Quién debe fijar la redacción definitiva. */
  readonly owner: 'Psicología';
  /** Dónde se usa (para revisarlo en su contexto). */
  readonly where: string;
  readonly text: string;
}

export const DRAFT_COPY = {
  /**
   * Antecede al rótulo del tramo cuando el estrés cruza 30, 60 u 85 (F6-12). Va en `polite` y sin alarmar: el
   * rótulo es el del medidor del HUD (`STRESS_TIER_LABELS`).
   */
  stressAnnouncementPrefix: {
    decision: 'VD-20',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla al cambiar el nivel de estrés (HUD)',
    text: 'Nivel de estrés:',
  },
} as const satisfies Record<string, DraftCopyEntry>;

export type DraftCopyKey = keyof typeof DRAFT_COPY;

/** Todos los borradores con su clave: lo que hay que llevarle a Psicología. */
export function draftCopyList(): Array<DraftCopyEntry & { key: DraftCopyKey }> {
  return (Object.keys(DRAFT_COPY) as DraftCopyKey[]).map(key => ({ key, ...DRAFT_COPY[key] }));
}
