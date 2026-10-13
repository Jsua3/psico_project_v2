/**
 * Textos en BORRADOR de la pantalla de juego (plan visual §9, decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23
 * y VD-24). Ninguno es texto validado: viven aquí, juntos, cada uno con su decisión, su responsable y dónde se usa,
 * para poder listarlos al usuario y cambiarlos en un solo sitio cuando Psicología fije la redacción definitiva.
 * Los textos YA validados (aviso de contenido, pausa, reintentos, opciones, ayuda…) no pasan por aquí: no se tocan.
 */
export interface DraftCopyEntry {
  /** Decisión del plan visual (§9) o regla de negocio que lo origina. */
  readonly decision: `VD-${number}` | `RN-${number}` | `ETH-${number}`;
  /** Quién debe fijar la redacción definitiva. */
  readonly owner: 'Psicología';
  /** Dónde se usa (para revisarlo en su contexto). */
  readonly where: string;
  /** Título, si el texto lo lleva (un diálogo). */
  readonly title?: string;
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
  /**
   * Confirmación al pulsar «Iniciar nuevo intento» con uno abierto (F6-2, RN-07): dice qué se pierde. «Continuar»
   * (el intento abierto se conserva) es la acción por defecto.
   */
  newAttemptConsequence: {
    decision: 'RN-07',
    owner: 'Psicología',
    where: 'Tarjeta de reanudar: confirmación de «Iniciar nuevo intento»',
    title: '¿Empezar un intento nuevo?',
    text: 'El intento que tienes abierto se cerrará y no podrás retomarlo. Si prefieres seguir donde ibas, elige «Continuar».',
  },
  /**
   * Chip de la cabecera del panel de diálogo y subtítulo del grupo de decisiones (F6-4, VD-24). Antes decía «Decisión
   * clínica»: el vocabulario de la interfaz es educativo, no clínico.
   */
  decisionLabel: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Panel de diálogo: chip de la cabecera y subtítulo del grupo de decisiones',
    text: 'Decisión',
  },
  /** Nombre accesible de la barra de herramientas (F6-4, VD-24). Antes decía «Inventario clínico». */
  inventoryLabel: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Dock de herramientas: nombre accesible de la barra',
    text: 'Inventario',
  },
  /** Cuando el navegador no deja registrar el consentimiento (F6-2, ETH-01): no se arranca nada y se puede reintentar. */
  consentStorageError: {
    decision: 'ETH-01',
    owner: 'Psicología',
    where: 'Aviso de contenido: error al registrar el consentimiento',
    text: 'No pudimos registrar tu consentimiento en este navegador. Revisa que no tenga bloqueado el almacenamiento e inténtalo de nuevo.',
  },
} as const satisfies Record<string, DraftCopyEntry>;

export type DraftCopyKey = keyof typeof DRAFT_COPY;

/** Todos los borradores con su clave: lo que hay que llevarle a Psicología. */
export function draftCopyList(): Array<DraftCopyEntry & { key: DraftCopyKey }> {
  return (Object.keys(DRAFT_COPY) as DraftCopyKey[]).map(key => ({ key, ...DRAFT_COPY[key] }));
}
