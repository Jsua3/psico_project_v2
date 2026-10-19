/**
 * Textos en BORRADOR de la pantalla de juego (plan visual §9, decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23
 * y VD-24). Ninguno es texto validado: viven aquí, juntos, cada uno con su decisión, su responsable y dónde se usa,
 * para poder listarlos al usuario y cambiarlos en un solo sitio cuando Psicología fije la redacción definitiva.
 * Los textos YA validados (aviso de contenido, pausa, reintentos, opciones, ayuda…) no pasan por aquí: no se tocan.
 *
 * Cada borrador dice qué se espera de Psicología (`review`): `validar` (decide la redacción: tono, terminología) o
 * `conocimiento` (microtexto de funcionamiento que se les enseña, sin que lo decidan). La hoja de revisión que se les
 * entrega sale de esta lista.
 */
import { statusLabel } from '../../shared/ui/labels';

export type DraftReview = 'validar' | 'conocimiento';

export interface DraftCopyEntry {
  /**
   * Decisión del plan visual (§9) o regla de negocio que lo origina; `F6-n` / `F7-n` cuando el texto nace de una
   * tarea del plan y no de una decisión.
   */
  readonly decision: `VD-${number}` | `RN-${number}` | `ETH-${number}` | `F6-${number}` | `F7-${number}` | `F10-${number}`;
  /** Quién debe fijar la redacción definitiva. */
  readonly owner: 'Psicología';
  /** Qué se espera de Psicología; sin indicar, `validar`. */
  readonly review?: DraftReview;
  /** Dónde se usa (para revisarlo en su contexto). */
  readonly where: string;
  /** Título, si el texto lo lleva (un diálogo). */
  readonly title?: string;
  readonly text: string;
}

/** Nombre del ajuste: lo usan la fila de Ajustes y la nota de la ayuda (una sola palabra para los dos sitios). */
const SHORTCUTS_SETTING_LABEL = 'Atajos de una tecla';

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
  /**
   * Lista «Ir a…» (F6-11, VD-19): título y ayuda. Llegar a personas y puertas sin mirar el lienzo ni usar el ratón.
   */
  placesDialog: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Lista «Ir a…»: título y ayuda',
    title: 'Ir a…',
    text: 'Elige a dónde quieres ir: caminarás hasta ahí y se te avisará al llegar.',
  },
  /** Cuando la sala no ofrece nada a lo que ir todavía (F6-11, VD-19): dice por qué en vez de quedar vacía. */
  placesEmpty: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Lista «Ir a…»: estado vacío',
    text: 'Todavía no hay nada a lo que ir: aquí aparecerán las personas y las puertas de la sala y lo que ya hayas examinado.',
  },
  /** Anuncio al llegar al destino elegido en «Ir a…» (F6-11, VD-19): va seguido del nombre del lugar. */
  placesArrived: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla al llegar con «Ir a…»',
    text: 'Llegaste a',
  },
  /** Anuncio cuando el camino hasta el destino de «Ir a…» no se pudo recorrer (F6-11, VD-19). */
  placesBlocked: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla si «Ir a…» no pudo llegar',
    text: 'No se pudo llegar a',
  },
  /**
   * Nota de la pantalla de ayuda sobre los atajos de una tecla (F6-10, VD-18): FUERA del bloque validado de la ayuda,
   * que no cambia ni un byte. Dice que se pueden apagar y dónde.
   */
  shortcutsHelpNote: {
    decision: 'VD-18',
    owner: 'Psicología',
    where: 'Pantalla de ayuda: nota sobre los atajos de una tecla (fuera del bloque validado)',
    text: `Los atajos de una tecla (J, E, WASD y los números de las opciones) se pueden apagar en Ajustes, en «${SHORTCUTS_SETTING_LABEL}».`,
  },
  /** Cuando el navegador no deja registrar el consentimiento (F6-2, ETH-01): no se arranca nada y se puede reintentar. */
  consentStorageError: {
    decision: 'ETH-01',
    owner: 'Psicología',
    where: 'Aviso de contenido: error al registrar el consentimiento',
    text: 'No pudimos registrar tu consentimiento en este navegador. Revisa que no tenga bloqueado el almacenamiento e inténtalo de nuevo.',
  },

  // ── Microtextos de funcionamiento (revisión de F6): se enseñan a Psicología, no los decide ─────────────────────
  /** Lo anuncia el lector de pantalla mientras se guarda el consentimiento (F6-2). */
  consentSaving: {
    decision: 'ETH-01',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Aviso de contenido: anuncio del lector de pantalla mientras se guarda el consentimiento',
    text: 'Registrando tu consentimiento…',
  },
  /** Motivo por el que «Guardar» espera en la bitácora reflexiva: sin texto no hay nada que guardar (F6-5). */
  journalSaveReason: {
    decision: 'F6-5',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Bitácora reflexiva: motivo por el que «Guardar» espera',
    text: 'Escribe tu reflexión para guardar',
  },
  /** Nombre del ajuste que enciende o apaga J, E, WASD y los números (F6-10, WCAG 2.1.4). */
  shortcutsSettingLabel: {
    decision: 'VD-18',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ajustes del juego: nombre del ajuste que enciende o apaga J, E, WASD y los números',
    text: SHORTCUTS_SETTING_LABEL,
  },
  /**
   * Pista de teclas de la barra de contexto con los atajos apagados (F6-10). La plantilla la repite con <kbd> en las
   * teclas; una prueba impide que las dos diverjan. Con los atajos activos la pista es la de siempre.
   */
  keysHintArrows: {
    decision: 'VD-18',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Barra de contexto del juego: pista de teclas cuando los atajos de una tecla están apagados',
    text: 'Flechas mover · Enter interactuar · Esc salida segura',
  },
  /** Nombre accesible del botón de la cabecera que abre la lista «Ir a…» (F6-11). */
  placesButtonLabel: {
    decision: 'VD-19',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Cabecera del juego: nombre accesible del botón que abre la lista «Ir a…»',
    text: 'Ir a… personas y puertas de la sala',
  },
  /**
   * Retroalimentación de una decisión sin clasificación conocida en la traza docente (F7-4, VD-24). Antes decía
   * «justificación clínica de la decisión»: el vocabulario de la interfaz es educativo, no clínico.
   */
  traceDecisionFallback: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: texto de apoyo de una decisión sin clasificación',
    text: 'Revisar el contexto del escenario y la justificación de la decisión.',
  },
  /** Texto de apoyo de un paso adecuado del recorrido (F7-4, VD-24). Antes decía «recorrido clínico simulado». */
  traceAdequateStep: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: línea de tiempo, paso adecuado',
    text: 'Paso adecuado dentro del recorrido simulado.',
  },
  /** Vacío del panel de decisiones de la traza docente (F7-4, VD-24). Antes decía «decisiones clínicas guardadas». */
  traceNoDecisions: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: diálogo de retroalimentación sin decisiones registradas',
    text: 'Este intento aún no tiene decisiones guardadas.',
  },
  /**
   * Rótulo del total de la rúbrica en la traza docente (F7-4, RN-09, decisión 9 del plan): la evaluación es formativa
   * y no una nota oficial. Si el equipo decide otro rótulo, solo cambia este texto.
   */
  formativeValuationLabel: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: rúbrica, total de la evaluación',
    text: 'Valoración formativa',
  },
  /** Nombres de los cuatro niveles de la valoración formativa (F7-4, RN-09, ED-2): no son una nota. */
  levelEnInicio: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'En inicio',
  },
  levelEnProceso: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'En proceso',
  },
  levelLogrado: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'Logrado',
  },
  levelDestacado: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'Destacado',
  },
  /**
   * Lo que el diálogo «Reemplazar intento» le dice al docente que pasa con el intento y su bitácora (F7b-7, E1-2, RN-07;
   * revisión de F7b). Hermana de `newAttemptConsequence`, que ve el estudiante: habla de la bitácora de la persona, así
   * que Psicología fija la redacción. El rótulo del estado es el mismo que ve la lista de intentos.
   */
  replaceAttemptConsequence: {
    decision: 'RN-07',
    owner: 'Psicología',
    where: 'Traza docente: diálogo «Reemplazar intento», consecuencia para el intento y su bitácora',
    text: `El intento se cerrará como «${statusLabel('REPLACED')}» y su bitácora quedará bloqueada; la próxima vez que la persona entre al caso empezará uno nuevo.`,
  },
  /**
   * Aviso de la ficha del caso cuando el caso trae contenido sensible (F10-1, RF-16): antes del aviso previo de
   * contenido (ETH-01), que sigue siendo el que pide el consentimiento. Dice lo que viene y recuerda la salida.
   */
  briefSensitiveNote: {
    decision: 'F10-1',
    owner: 'Psicología',
    where: 'Ficha del caso: aviso de contenido sensible, antes de «Comenzar»',
    text: 'Este caso trata situaciones delicadas. Antes de entrar verás un aviso, y en cualquier momento puedes parar con «Salida segura».',
  },
  /** Ficha del caso sin objetivos ni personajes redactados todavía (F10-1): se puede comenzar igual. */
  briefPending: {
    decision: 'F10-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ficha del caso: cuando el caso aún no trae objetivos ni personajes',
    text: 'Tu docente aún no ha redactado los objetivos ni los personajes de este caso. Puedes comenzar de todas formas.',
  },
  /**
   * Junto al contador de «Ver pista» (F10-2, RF-18, decisión 13): pedir una pista no cuesta puntaje. Corta a propósito: va
   * en la misma línea que el botón, porque en un celular cada renglón que se le suma al panel empuja las opciones.
   */
  hintNoCostNote: {
    decision: 'F10-2',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Pistas de la escena: junto al contador de «Ver pista»',
    text: 'sin costo',
  },
  /** Título de la sección «Tus decisiones» del resultado (F10-4, RN-08): la retroalimentación pedagógica va al cierre. */
  decisionsTitle: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: título de la sección «Tus decisiones» (una entrada por decisión)',
    text: 'Tus decisiones',
  },
  /** Sección «Tus decisiones» sin decisiones que mostrar (F10-4): el estado vacío dice por qué. */
  decisionsEmpty: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: «Tus decisiones» cuando el intento no tiene decisiones registradas',
    text: 'Este intento no tiene decisiones registradas para revisar.',
  },
  /** Descripción del estado vacío de «Tus decisiones» (F10-4): dice qué verá la persona cuando haya decisiones. */
  decisionsEmptyHint: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: descripción bajo el estado vacío de «Tus decisiones»',
    text: 'Cuando el caso registre decisiones, aparecerán aquí con su explicación.',
  },
  /** Error al cargar «Tus decisiones» (F10-4): el resto del resultado sigue visible y el botón reintenta. */
  decisionsError: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: «Tus decisiones» cuando no se puede cargar el reporte',
    text: 'No pudimos cargar tus decisiones. Puedes intentarlo de nuevo.',
  },
  /** Una decisión sin explicación en el caso (F10-4, estado vacío por decisión): no inventa un texto. */
  decisionNoExplanation: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: decisión de «Tus decisiones» sin explicación pedagógica',
    text: 'El caso no trae una explicación para esta decisión.',
  },
  /** Rótulo del fundamento teórico de una decisión (F10-4). */
  decisionBasisLabel: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: fundamento teórico de cada decisión',
    text: 'Fundamento teórico',
  },
  /** Etiquetas cualitativas de la clasificación al cierre (RN-08): lenguaje formativo, nunca un puntaje. */
  decisionToneAdequate: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: etiqueta cualitativa de una decisión adecuada',
    text: 'Adecuada',
  },
  decisionToneRisky: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: etiqueta cualitativa de una decisión con riesgo',
    text: 'Con riesgo',
  },
  decisionToneInadequate: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: etiqueta cualitativa de una decisión inadecuada',
    text: 'Inadecuada',
  },
  /** Nota de una conducta prohibida en «Tus decisiones»: se señala con cuidado, sin cifras (RN-08, ETH). */
  decisionProhibitedNote: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: nota de una conducta prohibida en «Tus decisiones»',
    text: 'Alerta ética: esta respuesta puede aumentar el riesgo de revictimización.',
  },
  /** Marcador de avance del HUD y del resultado cuando `scoreMarker = 'progress'` (VD-6): sin cifra de puntos. */
  scoreProgressLabel: {
    decision: 'VD-6',
    owner: 'Psicología',
    where: 'Resultado: marcador de avance (scoreMarker = progress), en lugar de «Puntaje total»',
    text: 'Avance del caso',
  },
  scoreProgressDone: {
    decision: 'VD-6',
    owner: 'Psicología',
    where: 'Resultado: valor del marcador de avance cuando el caso está completado',
    text: 'Completado',
  },
} as const satisfies Record<string, DraftCopyEntry>;

export type DraftCopyKey = keyof typeof DRAFT_COPY;

/** Todos los borradores con su clave y qué se espera de Psicología: lo que hay que llevarles. */
export function draftCopyList(): Array<DraftCopyEntry & { key: DraftCopyKey; review: DraftReview }> {
  return (Object.keys(DRAFT_COPY) as DraftCopyKey[]).map(key => ({ key, review: 'validar' as DraftReview, ...DRAFT_COPY[key] }));
}
