/**
 * Orientación del jugador (SIM-VBG-001): nombres, salas, grafo de puertas,
 * banderas de producto y textos fijos en un solo lugar. Todo es copy estático
 * del frontend: los textos del seed que quedaron
 * imprecisos se sobrescriben aquí sin re-sembrar la base.
 *
 * Reglas de redacción (diseño F§5): tuteo, imperativo neutro, sin exclamaciones
 * ni lenguaje de logro, todo con tildes y nunca un identificador interno.
 * Orienta PROCESO y LUGAR; jamás insinúa cuál opción de decisión es adecuada.
 */

export type RoomGroup = 'urgencias' | 'sala-escucha' | 'recepcion' | 'consultorio';

/** Orden del caso: avanza de Urgencias al Consultorio (regla monótona de salas alcanzadas). */
export const ROUTE_ORDER: readonly RoomGroup[] = ['urgencias', 'sala-escucha', 'recepcion', 'consultorio'];

export interface RoomLabel {
  /** «Sala de escucha familiar» (encabezados: «Hospital · Sala de escucha familiar»). */
  name: string;
  /** «en la Sala de escucha familiar» (sufijo de pasos y elementos que están en otra sala). */
  en: string;
  /** «Ve a la Sala de escucha familiar» (frase completa de «Ahora:» entre salas). */
  ve: string;
  group: 'Hospital' | 'Comisaría de Familia';
  /** «a la Sala de escucha familiar» / «al Consultorio» (con la contracción: «llegaste al Consultorio»). */
  to: string;
}

export const ROOM_LABELS: Record<RoomGroup, RoomLabel> = {
  'urgencias': {
    name: 'Urgencias', en: 'en Urgencias', ve: 'Ve a Urgencias', to: 'a Urgencias', group: 'Hospital',
  },
  'sala-escucha': {
    name: 'Sala de escucha familiar', en: 'en la Sala de escucha familiar',
    ve: 'Ve a la Sala de escucha familiar', to: 'a la Sala de escucha familiar', group: 'Hospital',
  },
  'recepcion': {
    name: 'Recepción', en: 'en la Recepción', ve: 'Ve a la Recepción', to: 'a la Recepción',
    group: 'Comisaría de Familia',
  },
  'consultorio': {
    name: 'Consultorio', en: 'en el Consultorio', ve: 'Ve al Consultorio', to: 'al Consultorio',
    group: 'Comisaría de Familia',
  },
};

/**
 * Arista dirigida entre salas → clave de la puerta (en la sala de origen) que lleva a la de destino.
 * Refleja el seed: de Recepción solo se pasa al Consultorio y no hay vuelta al hospital.
 */
export const ROOM_GRAPH: Record<RoomGroup, Partial<Record<RoomGroup, string>>> = {
  'urgencias': { 'sala-escucha': 'puerta-sala-escucha' },
  'sala-escucha': { 'urgencias': 'puerta-urgencias', 'recepcion': 'salida-institucional' },
  'recepcion': { 'consultorio': 'puerta-consultorio' },
  'consultorio': { 'recepcion': 'puerta-recepcion' },
};

export interface EntityName {
  /** Nombre tal como lo ve el jugador en el mundo (label del objeto o displayName del NPC). */
  name: string;
  article: 'el' | 'la' | 'los' | 'las';
  room: RoomGroup;
  /** Persona (se «habla con» ella). Un requisito de «revisar» sobre una persona se dice «hablar con». */
  person?: boolean;
}

/** Una línea por entidad del seed (objetos y NPC). Verificado contra el seed por orientation.config.spec. */
export const ENTITY_NAMES: Record<string, EntityName> = {
  // Urgencias
  'familia-crisis': { name: 'Familia en crisis', article: 'la', room: 'urgencias', person: true },
  'zona-restringida': { name: 'Acceso a quirófano', article: 'el', room: 'urgencias' },
  'tool-pap': { name: 'Kit PAP', article: 'el', room: 'urgencias' },
  'puerta-sala-escucha': { name: 'Sala de escucha familiar', article: 'la', room: 'urgencias' },
  'enfermera-urgencias': { name: 'Enfermera de urgencias', article: 'la', room: 'urgencias', person: true },
  'medico-guardia': { name: 'Médico de guardia', article: 'el', room: 'urgencias', person: true },
  'psicologa-orientadora': { name: 'Psicóloga hospitalaria', article: 'la', room: 'urgencias', person: true },
  // Sala de escucha familiar
  'familia-duelo': { name: 'Familia en crisis', article: 'la', room: 'sala-escucha', person: true },
  'marco-normativo-hospital': { name: 'Marco normativo', article: 'el', room: 'sala-escucha' },
  'psicologa-acompanante': { name: 'Psicóloga hospitalaria', article: 'la', room: 'sala-escucha', person: true },
  'tool-spikes': { name: 'Protocolo EPICEE', article: 'el', room: 'sala-escucha' },
  'tool-bitacora': { name: 'Bitácora', article: 'la', room: 'sala-escucha' },
  'puerta-urgencias': { name: 'Sala de urgencias', article: 'la', room: 'sala-escucha' },
  'salida-institucional': { name: 'Salida institucional', article: 'la', room: 'sala-escucha' },
  'resumen-bloque': { name: 'Registro hospitalario', article: 'el', room: 'sala-escucha' },
  'trabajadora-social': { name: 'Trabajadora social', article: 'la', room: 'sala-escucha', person: true },
  // Recepción de la Comisaría
  'expediente-caso': { name: 'Expediente del caso', article: 'el', room: 'recepcion' },
  'funcionaria-recepcion': { name: 'Funcionaria de recepción', article: 'la', room: 'recepcion', person: true },
  'puerta-consultorio': { name: 'Consultorio', article: 'el', room: 'recepcion' },
  'orientadora-juridica': { name: 'Orientadora jurídica', article: 'la', room: 'recepcion', person: true },
  'sobreviviente-espera': { name: 'Sobreviviente', article: 'la', room: 'recepcion', person: true },
  'madre-acompanante': { name: 'Madre de la sobreviviente', article: 'la', room: 'recepcion', person: true },
  // Consultorio
  'sobreviviente-consulta': { name: 'Sobreviviente', article: 'la', room: 'consultorio', person: true },
  'marco-normativo-comisaria': { name: 'Marco normativo', article: 'el', room: 'consultorio' },
  'profesional-psicosocial': { name: 'Profesional psicosocial', article: 'la', room: 'consultorio', person: true },
  'tool-riesgo': { name: 'Valoración de riesgo', article: 'la', room: 'consultorio' },
  'tool-ruta': { name: 'Ruta de protección', article: 'la', room: 'consultorio' },
  'puerta-recepcion': { name: 'Recepción', article: 'la', room: 'consultorio' },
  'apoyo-psicosocial': { name: 'Apoyo psicosocial', article: 'el', room: 'consultorio', person: true },
  'cierre-resumen': { name: 'Cierre del caso', article: 'el', room: 'consultorio' },
};

/** Personajes que el diseño decidió NO listar como «También en esta sala» (su testimonio no es un estímulo). */
export const OPTIONAL_EXCLUDED_KEYS: ReadonlySet<string> = new Set(['sobreviviente-espera']);

export interface ToolHint {
  /** Sala donde se consigue. */
  room: RoomGroup;
  /** Descripción genérica, con artículo: «el material del estante». Es lo que se dice por defecto. */
  generic: string;
  /** Nombre real con artículo: «el Protocolo EPICEE». Solo con NAME_TOOLS_IN_HINTS = true. */
  named: string;
}

/** Claves = tool_code de la BD. */
export const TOOL_HINTS: Record<string, ToolHint> = {
  PAP: { room: 'urgencias', generic: 'el material de apoyo de la sala', named: 'el Kit PAP' },
  SPIKES: { room: 'sala-escucha', generic: 'el material del estante', named: 'el Protocolo EPICEE' },
  RISK_METER: { room: 'consultorio', generic: 'el instrumento de la sala', named: 'la Valoración de riesgo' },
};

/**
 * Banderas de producto (pregunta 1 de Psicología). Por defecto, conservadoras:
 * la lista no nombra técnicas; el anillo sí marca el maletín, que el jugador ya ve en el mundo.
 */
export const NAME_TOOLS_IN_HINTS: boolean = false;
export const HIGHLIGHT_TOOL_TARGETS: boolean = true;
/**
 * «Salida segura» es alcanzable en todos los estados jugables (F§4.7): introducción, contexto, exploración, ajustes,
 * ayuda, diálogo con y sin opciones, supervisión, bitácora y pausa. Verificado jugando (T9.8); mientras sea cierto, la
 * ayuda y el aviso pueden prometerla. Si un estado vuelve a perder la salida, esta bandera debe volver a false.
 */
export const SAFE_EXIT_ALWAYS_REACHABLE: boolean = true;

export const DECISION_TOTAL = 6;

/** Textos fijos (F§5.1, F§5.3-5.6). Funciones solo donde hay datos que intercalar. */
export const ORIENTATION_COPY = {
  card: {
    title: 'Qué hacer',
    counter: (k: number, total: number = DECISION_TOTAL): string => `Decisión ${k} de ${total}`,
    counterClosed: 'Caso cerrado',
    hide: 'Ocultar pasos',
    show: 'Mostrar pasos',
    /** n = pasos pendientes; sin número si todo está hecho. */
    chip: (pending: number): string => (pending > 0 ? `Qué hacer · ${pending}` : 'Qué hacer'),
    optionalTitle: 'También en esta sala',
    marks: { talked: 'ya hablaste', reviewed: 'ya revisaste', notYet: 'aún no' },
    hereSuffix: ' · estás aquí',
    /** Texto oculto (solo lectores de pantalla) al inicio de cada fila. */
    stateText: { done: 'Hecho:', next: 'Siguiente:', pending: 'Pendiente:', locked: 'Bloqueado hasta:' },
    footerPending: (done: number, total: number): string =>
      `Recomendado antes de decidir: ${done} de ${total} ${total === 1 ? 'hecho' : 'hechos'}. Puedes decidir cuando quieras.`,
    footerDone: 'Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.',
  },
  now: {
    prefix: 'Ahora: ',
    /** Sin lista (nodo sin ruta ni derivación). */
    noList: 'Explora la sala. Acércate a una persona o un objeto y pulsa E.',
    noListTouch: 'Explora la sala. Acércate a una persona o un objeto y toca «Interactuar».',
    nothingNearby: 'No hay nada a tu alcance. Acércate a una persona o un objeto.',
    touchIdle: 'Acércate a algo',
  },
  ui: {
    helpAriaLabel: 'Abrir cómo se juega',
    helpTitle: 'Cómo se juega',
    settingsHelpRow: 'Cómo se juega',
    settingsHelpAgain: 'Ver la ayuda otra vez',
    safeExit: 'Salida segura',
    backToMap: 'Volver al mapa',
    dockTools: (n: number, m: number): string => `Herramientas ${n} de ${m}`,
    dockLocked: 'Se consigue explorando las salas del caso.',
  },
  notices: {
    obtained: (label: string): string => `Obtuviste: ${label}. Ya está en tu barra de herramientas.`,
    notedTalked: (article: string, name: string): string => `Anotado: hablaste con ${article} ${name}.`,
    notedReviewed: (article: string, name: string): string => `Anotado: revisaste ${article} ${name}.`,
    notedUsed: (generic: string): string => `Anotado: usaste ${generic} en la conversación.`,
    notedArrived: (room: RoomGroup): string => `Anotado: llegaste ${ROOM_LABELS[room].to}.`,
    newStage: (title: string): string => `Nueva etapa: ${title}`,
    decisionRegistered: (k: number): string => `Decisión ${k} registrada`,
    registering: 'Registrando tu decisión…',
    supervision: 'Tu decisión quedó registrada en tu seguimiento formativo.',
    staleConversation: 'Esta conversación corresponde a otro momento del caso.',
    errorNpc: 'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.',
    errorTool: 'No pudimos usar la herramienta.',
    errorDecision: 'No pudimos registrar tu decisión. Inténtalo de nuevo.',
  },
  evidence: {
    /** frases: «hablar con la Enfermera de urgencias y usar el material de apoyo de la sala». */
    notice: (phrases: string): string =>
      `Antes de decidir te falta: ${phrases}. Puedes seguir explorando o decidir ahora; tu decisión quedará registrada con información incompleta.`,
    unknownPerson: 'alguien en otra sala',
    unknownThing: 'algo en otra sala',
  },
  door: {
    before: (phrases: string): string => `Antes de pasar, ${phrases}.`,
    hospitalGate: 'Esta salida se abre cuando termines las decisiones del hospital.',
    hospitalGateRemaining: (n: number): string => (n === 1 ? 'Te queda 1 decisión.' : `Te quedan ${n} decisiones.`),
    laterGate: 'Esta salida se abre más adelante en el caso.',
    fallback: 'Antes de pasar, revisa lo pendiente en «Qué hacer».',
  },
} as const;
