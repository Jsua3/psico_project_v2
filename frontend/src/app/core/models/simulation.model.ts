export interface CatalogItem {
  caseVersionId: number;
  code: string;
  title: string;
  description: string;
  order: number;
  unlocked: boolean;
  completed: boolean;
  locked: boolean;
  /** La decisión de acceso del servidor (asignación, ventana y secuencia); `unlocked` sigue diciendo lo mismo en pocas palabras. */
  access?: CaseAccess;
}

/** Por qué el servidor no deja iniciar un caso: la asignación, su ventana o la secuencia lineal (E3-2; RN-04, RF-15). */
export type CaseAccessReason = 'NOT_ASSIGNED' | 'NOT_YET_OPEN' | 'CLOSED' | 'LOCKED_BY_SEQUENCE';

/** La decisión de acceso de un estudiante a una versión (`access` de C8 y del catálogo). Las horas son de Bogotá, sin zona. */
export interface CaseAccess {
  allowed: boolean;
  reason?: CaseAccessReason;
  opensAt?: string;
  closesAt?: string;
}

export interface CaseBriefCharacter {
  id: number;
  displayName: string;
  roleLabel: string;
  /** Clave del retrato en el kit de personajes (`catalog.actors`). */
  portraitKey: string;
}

/** La ficha del caso (C8, RF-16, CU-07): lo que se lee antes de jugar. Pedirla no crea intento. */
export interface CaseBrief {
  caseVersionId: number;
  title: string;
  context: string;
  characters: CaseBriefCharacter[];
  learningObjectives: string[];
  hasSensitiveContent: boolean;
  access: CaseAccess;
}

/** Por qué ya no hay pista que pedir en la escena: no tiene ninguna, o el intento ya las vio todas (C9). */
export type HintReason = 'NONE_FOR_SCENE' | 'ALL_SHOWN';

export interface SceneHint {
  id: number;
  order: number;
  text: string;
}

/** Las pistas de la escena donde está el jugador (C9, RF-18, CU-09): las que ya pidió y cuántas le quedan. Pedirlas no cuesta puntaje. */
export interface HintState {
  available: number;
  shown: SceneHint[];
  reason?: HintReason;
}

export interface SimulationCaseSummary {
  caseVersionId: number;
  code: string;
  title: string;
  description: string;
  semanticVersion: string;
  nodeCount: number;
  status: string;
}

export interface ProgressMapNode {
  key: string;
  label: string;
  start: boolean;
  terminal: boolean;
}

export interface ProgressMapState {
  nodes: ProgressMapNode[];
  visitedNodeKeys: string[];
  currentNodeKey: string;
}

export interface SimulationAttemptState {
  attemptId: string;
  attemptToken: string;
  caseVersionId: number;
  caseTitle: string;
  /**
   * PAUSED = pausa segura reanudable; SAFE_EXITED = salida segura terminal (solo histórica);
   * REPLACED = cerrado porque el estudiante empezó otro intento (no es salida segura).
   */
  status: 'IN_PROGRESS' | 'PAUSED' | 'SAFE_EXITED' | 'COMPLETED' | 'REPLACED';
  /** La persona consultante en palabras (Tarea 9): vínculo y activación en la ficción, sin cifras. */
  persona: Persona;
  currentNode: SimulationNodeState;
  completionReport: AttemptCompletionReport | null;
  supportResources: string[];
}

/** La clase de una respuesta (modelo de métricas): la única etiqueta que el docente y el reporte congelado comparten. */
export type ResponseClass = 'RECOMMENDED' | 'ACCEPTABLE' | 'RISKY' | 'CONTRAINDICATED';

/** Vínculo de la persona consultante con quien la atiende: retraída, cautelosa o abierta. */
export type Bond = 'WITHDRAWN' | 'GUARDED' | 'OPEN';

/** Activación de la persona consultante: serena, tensa o en crisis. */
export type Activation = 'CALM' | 'TENSE' | 'CRISIS';

/** Intensidad de una escena; una escena `HIGH` exige `warningMessage` (Tarea 4). */
export type Intensity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * La persona consultante en palabras (Tarea 9): vínculo y activación sin cifras. `label` es la frase para el
 * estudiante («se muestra cautelosa y tensa»).
 */
export interface Persona {
  bond: Bond;
  activation: Activation;
  label: string;
}

/** La persona después de decidir en una escena (traza docente, `personaPorEscena`). */
export interface PersonaPorEscena extends Persona {
  nodeId: number;
  nodeTitle: string;
}

/** Un hito del caso en un reporte: `decisive` marca los que deciden el final. */
export interface MilestoneEntry {
  key: string;
  label: string;
  decisive: boolean;
}

/** Los hitos de un intento: los cumplidos (en el orden en que se cumplieron) y los que faltaron. */
export interface MilestoneReport {
  done: MilestoneEntry[];
  missing: MilestoneEntry[];
}

/** Cuántas decisiones registradas hubo de cada clase (traza docente y reporte v3). */
export interface ClassCounts {
  recommended: number;
  acceptable: number;
  risky: number;
  contraindicated: number;
}

/** Los conteos del reporte congelado v3: por clase y los hechos del recorrido (un conteo de hechos no es una medida). */
export interface ReportCounts extends ClassCounts {
  retries: number;
  prohibitedRetries: number;
  toolsUsed: number;
  reflections: number;
}

export interface AttemptTimelineEntry {
  atSeconds: number | null;
  time: string;
  type: string;
  class: ResponseClass | null;
  prohibited: boolean;
  label: string;
}

export interface AttemptCompletionReport {
  attemptId: string;
  caseTitle: string;
  status: SimulationAttemptState['status'];
  /** 3 en el reporte congelado actual; los v1 y v2 ya cerrados no se recalculan (y no traen los campos de v3). */
  schemaVersion?: number;
  totalDurationSeconds: number | null;
  phaseDurations: PhaseDuration[];
  toolsUsed: number;
  reflectionsCount: number;
  safeExitUsed: boolean;
  visitedNodeTitles: string[];
  recommendations: string[];
  summaryMessage: string;
  /** Línea de tiempo de decisiones/acciones clave (backend puede omitirla). */
  timeline?: AttemptTimelineEntry[];
  /** El final por hitos y clases de respuesta, con su razón en palabras (solo intentos COMPLETED). */
  ending?: EndingReport | null;
  /** Veces que una primera respuesta riesgosa no se aplicó (reintentos); no cuentan como decisiones registradas. */
  retries?: number;
  /** De esos reintentos, los que eran conducta prohibida (el docente los distingue en su traza). */
  prohibitedRetries?: number;
  /** Los hitos cumplidos y los que faltaron (reporte v3). */
  milestones?: MilestoneReport;
  /** La persona consultante al cerrar, en palabras (reporte v3). */
  persona?: Persona;
  /** Decisiones por clase y hechos del recorrido (reporte v3). */
  counts?: ReportCounts;
  /** Una entrada por decisión registrada, con su explicación y fundamento (C2). Solo en el reporte congelado. */
  decisionReview?: DecisionReviewItem[];
  /** El perfil por competencia con la evidencia que lo sostiene (E6-1d, v3). */
  competencyLevels?: CompetencyLevelEntry[];
  /** Las notas de reflexión por escena, sin su texto. */
  reflections?: { nodeId: number; nodeTitle: string; locked: boolean }[];
  /** Cuántas escenas con decisión tienen reflexión (E6-1d). */
  reflectionCoverage?: { definition: string; reflections: number; decisionScenes: number; covered: boolean };
  /** «Evidencia clave»: completado, con reflexión y con al menos un nivel de competencia (RQ-NEG-004). */
  keyLearningEvidence?: boolean;
  /** Segundos por escena. */
  timeByScene?: { nodeId: number; seconds: number }[];
}

/** Una decisión que sostiene el nivel de una competencia (reporte v3, `competencyLevels[].evidence[]`). */
export interface CompetencyEvidence {
  order: number;
  nodeTitle: string;
  optionText: string;
  class: ResponseClass;
  level: FormativeLevel | null;
}

/** El nivel de una competencia en el reporte congelado; `level` es nulo si no hubo evidencia suficiente. */
export interface CompetencyLevelEntry {
  code: string;
  name: string;
  level: FormativeLevel | null;
  /** Con qué se calculó el nivel, en palabras; nulo si ninguna decisión tocó la competencia. */
  basis: string | null;
  evidence: CompetencyEvidence[];
}

/**
 * La consecuencia narrativa de una decisión (C2, RN-08): qué pasa en el caso, nunca si la respuesta estuvo bien o mal.
 * `source` dice de dónde sale el texto: la opción o la escena a la que lleva.
 */
export interface DecisionConsequence {
  text: string;
  source: 'OPTION' | 'NODE';
}

/** Reintento que concede el caso (`rules.secondChance`): la primera respuesta no se aplicó. */
export interface DecisionRetry {
  allowed: true;
  /** Mensaje del servidor para la otra oportunidad; el juego no lo muestra al decidir. */
  message: string;
}

/** Lo que devuelve una decisión: el estado del intento, su consecuencia y, si la regla lo concede, el reintento. */
export interface SimulationDecisionResult extends SimulationAttemptState {
  consequence: DecisionConsequence | null;
  retry: DecisionRetry | null;
}

/**
 * Una decisión del reporte congelado (C2, `decisionReview[]`): lo que eligió, su consecuencia y la retroalimentación
 * pedagógica con su fundamento. `reconsidered` solo existe si la primera respuesta no se aplicó.
 */
export interface DecisionReviewItem {
  order: number;
  nodeId: number;
  nodeTitle: string;
  chosen: { optionId: number; text: string };
  consequence: string;
  feedback: { explanation: string; theoryBasis?: string };
  class: ResponseClass;
  prohibited: boolean;
  reconsidered?: { firstOptionId: number; firstOptionText: string };
}

/**
 * El final del intento (Tarea 8): sale de los hitos y las clases de respuesta. `key` es el del final de la plantilla
 * (`critica`, `protectora`, `riesgo_persistente`, `con_brechas`) o uno propio del caso; `reason` lo explica en palabras.
 */
export interface EndingReport {
  key: string;
  title: string;
  message: string;
  tone: 'positive' | 'neutral' | 'warning' | 'critical';
  reason: string[];
}

export interface PhaseDuration {
  nodeId: number;
  nodeTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface SimulationNodeState {
  id: number;
  key: string;
  title: string;
  narrative: string;
  supportResources: string[];
  requiredTools: string[];
  sensitiveContent: boolean;
  safeExitRequired: boolean;
  warningMessage: string | null;
  terminal: boolean;
  /** Intensidad de la escena: la que decide el aviso previo (Tarea 4). */
  intensity: Intensity;
  options: SimulationDecisionOption[];
}

/** Solo `id` y `text`: el servidor no manda la clasificación de una opción antes de elegirla (evaluación formativa). */
export interface SimulationDecisionOption {
  id: number;
  text: string;
}

export interface SimulationWorldState {
  attemptId: string;
  status: SimulationAttemptState['status'];
  map: SceneMapState;
  player: PlayerState;
  objects: MapObjectState[];
  collisions: CollisionZoneState[];
  tools: ClinicalToolState[];
  inventory: string[];
  inspectedObjectKeys: string[];
  viewedDialogueKeys: string[];
  usedToolKeys: string[];
  flags: Record<string, unknown>;
}

export interface SceneMapState {
  id: number;
  key: string;
  title: string;
  width: number;
  height: number;
  theme: string;
  spawnX: number;
  spawnY: number;
  ambient: Record<string, unknown>;
}

export interface PlayerState {
  x: number;
  y: number;
}

export interface MapObjectState {
  key: string;
  label: string;
  type: 'PERSON' | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING' | 'EXIT';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  icon: string;
  shortCode: string;
  collision: boolean;
  interactionPrompt: string;
  interactionText: string;
  decisionOptionId: number | null;
  toolCode: string | null;
  dialogue: DialogueState | null;
  /** B1 movement passthrough — additive; backend may omit on older payloads. */
  movementPattern?: Record<string, unknown>;
  facing?: string;
  metadata?: Record<string, unknown>;
}

export interface CollisionZoneState {
  key: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClinicalToolState {
  code: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  active: boolean;
}

export interface DialogueState {
  key: string;
  speakerName: string;
  portraitKey: string | null;
  /** Receta del kit del NPC que habla (solo en el cliente: diálogos de NPC de escenario). */
  recipeId?: string | null;
  emotion: string;
  lines: DialogueLineState[];
  choices: DialogueChoiceState[];
  /** UI: aviso único sobre las opciones (p. ej. lo que falta antes de decidir). Solo presentación. */
  notice?: string | null;
  /** UI: la conversación corresponde a otro momento del caso; se muestra como informativa, sin decisiones. */
  stale?: boolean;
}

export interface DialogueLineState {
  order: number;
  speakerName: string;
  text: string;
  emotion: string;
}

export interface DialogueChoiceState {
  key: string;
  text: string;
  decisionOptionId: number | null;
  requiredToolCode: string | null;
  effect: Record<string, unknown>;
  /** UI: la decisión se tomaría con información incompleta (gating frontend, Fase 9). */
  evidenceWarning?: string;
  /** UI: la opción exige una herramienta que el jugador aún no tiene; no se puede activar. */
  toolMissing?: boolean;
}

export interface InteractionResult {
  world: SimulationWorldState;
  interaction: MapObjectState;
  dialogue: DialogueState | null;
  preparedDecisionOptionId: number | null;
  unlockedToolCode: string | null;
}

/**
 * Fase 6 — Contextual feedback when a clinical tool is used.
 * El mensaje hace diegético el uso de la herramienta; no mueve ninguna cifra.
 */
export interface ToolUseResult {
  world: SimulationWorldState;
  toolCode: string;
  targetKey: string | null;
  pertinent: boolean;
  feedbackMessage: string;
}

export interface AttemptTrace {
  attemptId: string;
  studentAlias: string;
  caseTitle: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalDurationSeconds: number | null;
  /** El servidor no la manda en la traza. */
  phaseDurations?: PhaseDuration[];
  /** Tiempo con la persona jugando, en segundos. */
  activeSeconds: number;
  /** Decisiones registradas por clase de respuesta. */
  counts: ClassCounts;
  /** Los hitos cumplidos y los que faltaron. */
  milestones: MilestoneReport;
  /** La persona después de decidir en cada escena. */
  personaPorEscena: PersonaPorEscena[];
  /** El final del intento; nulo si no se completó. */
  ending: EndingReport | null;
  /** Primeras respuestas que el juego no aplicó (reintento): no entran en los contadores de decisiones (T11.1, L-02). */
  retries?: number;
  prohibitedRetries?: number;
  safeExitUsed: boolean;
  timeline: AttemptTimelineEntry[];
  visitedNodeTitles: string[];
  events: TraceEvent[];
  world: SimulationWorldState;
  reflections: ReflectionTrace[];
  rubricEvaluations: RubricSummary[];
  /** La valoración automática; plegada (nula) hasta que el docente guarda la suya. */
  systemEvaluation: SystemEvaluation | null;
  /** Hay una valoración automática que mostrar cuando el docente registre la suya. */
  systemEvaluationAvailable: boolean;
}

/** La valoración automática del sistema que ve el docente tras registrar la suya: resumen y perfil por competencia. */
export interface SystemEvaluation extends RubricSummary {
  competencyLevels: CompetencyLevelEntry[];
}

export interface TraceEvent {
  type: string;
  class: ResponseClass | null;
  nodeTitle: string | null;
  decisionText: string | null;
  detail: string | null;
  occurredAt: string;
}

export interface ReflectionTrace {
  nodeId: number;
  nodeTitle: string;
  text: string;
  locked: boolean;
}

/** Niveles cualitativos de la valoración formativa (RN-09, ED-2): no son una nota. */
export type FormativeLevel = 'EN_INICIO' | 'EN_PROCESO' | 'LOGRADO' | 'DESTACADO';

export interface RubricSummary {
  id: number;
  rubricName: string;
  /** Quién la hizo: el docente o el sistema. */
  origin?: 'DOCENTE' | 'SISTEMA';
  /** Nivel global de la evaluación; null mientras falte calificar algún criterio. */
  overallLevel?: FormativeLevel | null;
  comment: string | null;
  evaluatedAt: string;
}

export interface RecentAttempt {
  attemptId: string;
  studentAlias: string;
  caseTitle: string;
  status: string;
  startedAt: string;
}

export interface StudentAttemptSummary {
  attemptId: string;
  caseVersionId: number;
  caseTitle: string;
  status: SimulationAttemptState['status'];
  totalDurationSeconds: number | null;
  /** Tiempo activo estimado (sin pausas ni esperas > 5 min). null si no terminó. */
  activeDurationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface RubricEvaluationView {
  attemptId?: string;
  rubricId: number;
  rubricName: string;
  description: string | null;
  status?: string;
  criteria: RubricCriterionView[];
  scores: CriterionScoreView[];
  /** Los cuatro niveles que el docente elige, con su descriptor (Tarea 12); la rúbrica se califica solo por niveles. */
  levels?: RubricLevelOption[];
  /** Nivel global de la valoración formativa (RN-09); null mientras falte calificar algún criterio. */
  overallLevel?: FormativeLevel | null;
  comment: string | null;
}

export interface RubricCriterionView {
  id: number;
  competency: string;
  title: string;
  description: string | null;
  weight?: number;
  displayOrder: number;
}

/** Un nivel que el docente puede elegir en un criterio: valor, nombre y descriptor. */
export interface RubricLevelOption {
  value: FormativeLevel;
  label: string;
  descriptor: string;
}

export interface CriterionScoreView {
  criterionId: number;
  /** Nivel formativo de este criterio; nulo mientras no se califica. */
  level?: FormativeLevel | null;
  comment: string | null;
  evidence: Record<string, unknown>;
}

// ─── Editor-specific states (include DB ids for CRUD) ─────────────────────────

export interface NodeEditorState {
  id: number;
  key: string;
  title: string;
  narrative: string;
  supportResources: string[];
  requiredTools: string[];
  sensitiveContent: boolean;
  safeExitRequired: boolean;
  warningMessage: string | null;
  terminal: boolean;
  startNode: boolean;
  positionX: number | null;
  positionY: number | null;
  /** Intensidad de la escena: `MEDIUM` por defecto y `HIGH` en las sensibles; `HIGH` exige `warningMessage`. */
  intensity: Intensity;
  /** El enunciado de la decisión (E3-6, RF-06): lo que se lee antes de elegir; vacío = la escena no lo declara. */
  decisionPrompt: string;
  /** El lugar de la escena en la lista del editor (E3-6, RF-08): 0…n-1 tras reordenar; informativo, no cambia el grafo. */
  displayOrder: number;
}

export interface DecisionEdgeState {
  id: number;
  optionKey: string;
  sourceNodeId: number;
  sourceKey: string;
  targetNodeId: number;
  targetKey: string;
  text: string;
  /** Clasificación antigua que el servidor aún devuelve por compatibilidad; la que cuenta es `responseClass`. */
  classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE';
  /** La clase de la respuesta; `CONTRAINDICATED` exige `prohibitionReason`. */
  responseClass: ResponseClass;
  prohibitedConduct: boolean;
  prohibitionReason: string | null;
  immediateFeedback: string;
  /** Lo que la opción mueve en el caso: la persona, los hitos y las competencias (E3-8). */
  effects: DecisionEffects;
  /** Lo que pasa en la historia al elegir la opción (E3-7). */
  consequenceText: string;
  /** El fundamento teórico que respalda la retroalimentación (E3-7). */
  theoryBasis: string;
  /** La retroalimentación pedagógica: por qué la opción es adecuada o no (E3-7, RF-10). */
  feedbackText: string;
}

/**
 * Lo que una opción mueve (E3-8). `persona` son pasos de −1 a +1 por eje; `milestones` son claves de hitos del caso;
 * `competencies` son los códigos del catálogo (con su nivel, o nulo: lo da la clase).
 */
export interface DecisionEffects {
  persona?: { bond?: number; activation?: number };
  milestones?: string[];
  competencies?: string[] | Record<string, FormativeLevel | null>;
}

/** Un hito declarado por el caso (`rules.milestones[]`). `decisive` marca los que deciden el final. */
export interface Milestone {
  key: string;
  label: string;
  description: string;
  decisive: boolean;
}

/** Nivel de riesgo del caso, de la escala DA del protocolo de Medicina Legal; el catálogo es sustituible por caso. */
export type RiskLevel = 'VARIABLE' | 'MODERATE' | 'SEVERE' | 'EXTREME';

/** Una condición de un final: `{all}`, `{any}`, `{not}`, `{milestone}`, `{count}` o `{persona}`. */
export type EndingCondition = Record<string, unknown>;

/** Un final del caso, evaluado en orden: el primero cuya condición se cumple. */
export interface EndingRule {
  key: string;
  title: string;
  message: string;
  tone: EndingReport['tone'];
  when: EndingCondition;
}

/** Las reglas del caso que el editor lee y escribe con `PUT …/rules/{milestones,risk,endings}`. */
export interface CaseRules {
  milestones: Milestone[];
  riskLevel: RiskLevel | null;
  endings: EndingRule[];
}

export interface MapEditorState {
  id: number;
  key: string;
  title: string;
  width: number;
  height: number;
  theme: string;
  spawnX: number;
  spawnY: number;
  nodeId: number;
  nodeKey: string;
}

export interface MapObjectEditorState {
  id: number;
  key: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colorHex: string;
  icon: string;
  shortCode: string;
  collision: boolean;
  visible: boolean;
  interactionPrompt: string;
  interactionText: string;
  decisionOptionId: number | null;
  toolCode: string | null;
  mapId: number;
}

export interface ClinicalToolEditorState {
  id: number;
  code: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  active: boolean;
}

/** Una ayuda (pista) de la sala de un nodo (E3-5, RF-11): `order` es su lugar entre las de esa sala. */
export interface HintEditorState {
  id: number;
  mapId: number;
  order: number;
  text: string;
}

/** Un personaje del catálogo del caso (E3-3, RF-07). */
export interface CharacterEditorState {
  id: number;
  key: string;
  displayName: string;
  roleLabel: string;
  /** Clave del kit de personajes; vacía = el retrato se elige por el nombre. */
  portraitKey: string;
  /** Si aparece en la ficha del caso antes de empezar (los que se descubren jugando, no). */
  showInBrief: boolean;
  displayOrder: number;
}

/** Un ítem de la lista de publicación (E2-7): el código y el texto los fija el servidor. */
export interface PublicationChecklistItem {
  code: string;
  label: string;
  /** Obligatorio para publicar (con la bandera estricta se suma el ítem de alcance educativo). */
  required: boolean;
  fulfilled: boolean;
  /** Texto en borrador, pendiente de la validación de Psicología (decisión 17). */
  draft: boolean;
}

/** La lista de publicación del editor (E2-7): ítems del autor y la constancia de revisión de contenido (solo lectura). */
export interface PublicationChecklistView {
  items: PublicationChecklistItem[];
  /** «Revisión de contenido por Psicología»: la cumple la constancia que registra el ADMIN, no una casilla. */
  contentReview: {
    fulfilled: boolean;
    reviewer?: string | null;
    reviewedOn?: string | null;
    reference?: string | null;
  };
  strict: boolean;
}

export interface CaseEditorView {
  caseVersionId: number;
  /** Revisión del borrador (E2-6): viaja en `X-Case-Revision` en cada mutación y la respuesta trae la siguiente. */
  revision: number;
  title: string;
  semanticVersion: string;
  status: string;
  /** El contexto de la ficha del caso (E3-4). */
  context: string;
  /** Los objetivos de aprendizaje de la ficha (E3-4). */
  learningObjectives: string[];
  nodes: NodeEditorState[];
  decisions: DecisionEdgeState[];
  maps: MapEditorState[];
  objects: MapObjectEditorState[];
  tools: ClinicalToolEditorState[];
  hints: HintEditorState[];
  characters: CharacterEditorState[];
  /** Los hitos, el nivel de riesgo y los finales del caso. */
  rules: CaseRules;
  rubrics: RubricEvaluationView[];
  checklistCompletion: number;
  publishable: boolean;
  checklist: PublicationChecklistView;
}

// ─── Authoring CRUD request models ────────────────────────────────────────────

export interface NodeUpsertRequest {
  nodeKey: string;
  title: string;
  narrative: string;
  requiredTools: string[];
  supportResources: string[];
  sensitiveContent: boolean;
  safeExitRequired: boolean;
  warningMessage: string | null;
  terminal: boolean;
  startNode: boolean;
  positionX: number | null;
  positionY: number | null;
  /** Ausente = el servidor no lo toca; vacío = la escena no declara enunciado. */
  decisionPrompt?: string;
  /** Ausente = no se toca (una escena nueva sensible nace en `HIGH`). */
  intensity?: Intensity;
}

export interface DecisionOptionUpsertRequest {
  sourceNodeId: number;
  targetNodeId: number;
  optionKey: string;
  text: string;
  /** Obligatoria en una opción nueva. */
  responseClass?: ResponseClass;
  prohibitedConduct: boolean;
  prohibitionReason: string | null;
  immediateFeedback: string;
  /** Ausente = no se toca; `{}` limpia los efectos. */
  effects?: DecisionEffects;
  /** Texto plano de hasta 1.200 caracteres (E3-7); ausente = no se toca, vacío = se borra. */
  consequenceText?: string;
  theoryBasis?: string;
  feedbackText?: string;
}

/** Una ayuda de una sala: texto plano de hasta 280 caracteres; sin `hintOrder` se agrega al final. */
export interface HintUpsertRequest {
  text: string;
  hintOrder?: number;
}

/** Un personaje del caso; los opcionales ausentes no se tocan. */
export interface CharacterUpsertRequest {
  characterKey: string;
  displayName: string;
  roleLabel?: string;
  portraitKey?: string;
  showInBrief?: boolean;
  displayOrder?: number;
}

/** La ficha del caso: ausente = no se toca; `[]` vacía los objetivos. */
export interface BriefUpdateRequest {
  context?: string;
  learningObjectives?: string[];
}

export interface MapUpsertRequest {
  nodeId: number;
  mapKey: string;
  title: string;
  width: number;
  height: number;
  theme: string;
  spawnX: number;
  spawnY: number;
}

export interface MapObjectUpsertRequest {
  objectKey: string;
  label: string;
  objectType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colorHex: string;
  icon: string;
  shortCode: string;
  collision: boolean;
  visible: boolean;
  interactionPrompt: string;
  interactionText: string;
  decisionOptionId: number | null;
  toolCode: string | null;
}

export interface ToolUpsertRequest {
  toolCode: string;
  label: string;
  icon: string;
  category: string;
  description: string;
}

export interface ChecklistUpdateRequest {
  contentOriginal: boolean;
  ethicsReviewed: boolean;
  safetyProtocols: boolean;
  noStigmatizing: boolean;
  triggerWarnings: boolean;
  accessibilityOk: boolean;
  /** Ítem de alcance educativo (E2-7): opcional salvo con la bandera estricta del servidor. */
  scopeEducational?: boolean;
}

// ─── WorldDefinition v2 — contrato canónico entre editor y juego (Fase 2) ────

export interface WorldValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  entityRef: string | null;
}

export interface WorldValidationState {
  errors: WorldValidationIssue[];
  warnings: WorldValidationIssue[];
  canPublish: boolean;
}

export interface SceneMapDefinition {
  id: number;
  key: string;
  title: string;
  width: number;
  height: number;
  theme: string;
  spawnX: number;
  spawnY: number;
  ambient: Record<string, unknown>;
}

export type WorldObjectType = 'PERSON' | 'PROP' | 'TOOL_TARGET' | 'EXIT' | 'TRIGGER' | 'NOTE' | 'RESOURCE'
  | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING';

export interface WorldObject {
  id: number;
  key: string;
  label: string;
  type: WorldObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  facing: 'down' | 'up' | 'left' | 'right';
  colorHex: string;
  icon: string;
  shortCode: string;
  collision: boolean;
  visible: boolean;
  interactionPrompt: string;
  interactionText: string;
  decisionOptionId: number | null;
  toolCode: string | null;
  unlockCondition: Record<string, unknown>;
  movementPattern: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface WorldCollisionZone {
  id: number;
  key: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldDialogueLine {
  order: number;
  speakerName: string;
  text: string;
  emotion: string;
}

export interface WorldDialogueChoice {
  key: string;
  text: string;
  decisionOptionId: number | null;
  requiredToolCode: string | null;
  effect: Record<string, unknown>;
  displayOrder: number;
}

export interface WorldDialogueTree {
  id: number;
  key: string;
  speakerName: string;
  portraitKey: string | null;
  emotion: string;
  mapObjectId: number | null;
  /** Clave estable del objeto dueño; usada al guardar para resolver objetos nuevos sin id. */
  mapObjectKey?: string;
  lines: WorldDialogueLine[];
  choices: WorldDialogueChoice[];
}

export interface WorldClinicalTool {
  id: number;
  code: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  active: boolean;
}

export interface SafeExitConfig {
  configured: boolean;
  exitObjectKey: string | null;
  supportResources: string[];
}

export interface WorldDefinition {
  schemaVersion: number;
  caseVersionId: number;
  revision: number;
  nodeId: number;
  map: SceneMapDefinition;
  objects: WorldObject[];
  collisionZones: WorldCollisionZone[];
  dialogues: WorldDialogueTree[];
  clinicalTools: WorldClinicalTool[];
  safeExit: SafeExitConfig;
  validation: WorldValidationState;
  /** Decisiones salientes del nodo de este mapa (para cablear opciones de respuesta). */
  availableDecisions: WorldOutgoingDecision[];
  /** Todas las salas (mapas) del caso — para puertas y switcher (Fase 3). */
  rooms: WorldRoom[];
}

export interface WorldOutgoingDecision {
  id: number;
  optionKey: string;
  text: string;
  classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE';
  targetNodeKey: string;
  prohibitedConduct: boolean;
}

export interface WorldRoom {
  nodeId: number;
  nodeKey: string;
  mapKey: string;
  title: string;
}

export interface WorldSaveRequest {
  revision: number;
  map: SceneMapDefinition;
  objects: WorldObject[];
  collisionZones: WorldCollisionZone[];
  dialogues: WorldDialogueTree[];
  clinicalTools: WorldClinicalTool[];
}

// ─── Multi-Room + NPC System (Plan 2) ─────────────────────────────────────────

export interface ScenarioConfig {
  scenarioKey: string;   // matches the mapa_key used by the backend
  startRoomKey: string;  // which room the player starts in
  rooms: RoomConfig[];
}

export interface RoomConfig {
  key: string;             // unique within this scenario
  tiledMapKey: string;     // key used in Phaser's asset cache (e.g. 'comisaria-sala-espera')
  tiledJsonPath: string;   // path relative to assets root (for preload)
  displayName: string;     // shown in title text pinned to screen
  spawnX: number;          // default player spawn x (world pixels, not tiles)
  spawnY: number;
  exits: RoomExitConfig[];
  npcs: NpcConfig[];
}

export interface RoomExitConfig {
  /** Name of the EXIT-type object in the Tiled Objects layer */
  objectName: string;
  targetRoomKey: string;
  /** Player spawn position in the target room when arriving via this exit */
  entryX: number;
  entryY: number;
}

// ─── NPC modular (flujo competitivo) ──────────────────────────────────────────

export type NpcMotionBehavior =
  | 'idle'
  | 'subtle-wander'
  | 'pace'
  | 'patrol'
  | 'avoidant'
  | 'attentive';

export interface NpcMotionAnchor {
  x: number;
  y: number;
  pauseMs?: number;
  face?: 'down' | 'up' | 'left' | 'right';
}

export interface NpcMovementZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NpcMotionConfig {
  behavior: NpcMotionBehavior;
  zone?: NpcMovementZone;
  anchors?: NpcMotionAnchor[];
  radius?: number;
  speed?: number;
  pauseMs?: number;
  startDelayMs?: number;
}

export interface NpcConfig {
  key: string;
  npcType: 'supervisor' | 'colleague' | 'family' | 'witness';
  displayName: string;
  /** Emoji used as portrait in dialogue panel */
  portrait: string;
  x: number;
  y: number;
  /** Receta del kit que lo dibuja (spec §8.1; antes avatarPresetKey + frameIndex). */
  recipeId: string;
  dialogue: NpcDialogue;
  motion?: NpcMotionConfig;
  facing?: 'down' | 'up' | 'left' | 'right';
  emotion?: 'neutral' | 'calm' | 'worried' | 'anxious' | 'receptive' | 'closed';
}

export interface NpcDialogue {
  lines: NpcDialogueLine[];
}

export interface NpcDialogueLine {
  text: string;
  emotion?: string;
}

// ─── Revisión del caso (F10-6†: C4 ciclo de vida y C6 validación) ─────────────────────────────────────────

/** Estado de una versión del caso (REGLA-005: lo publicado no se edita, se clona). */
export type CaseLifecycleState = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type CaseLifecycleAction = 'submit' | 'approve' | 'reject' | 'archive' | 'clone';

/** Un hallazgo de la validación en lenguaje llano; `nodeId` y `mapId` dicen a qué elemento llevar al autor. */
export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  nodeId?: number;
  mapId?: number;
}

export interface CaseValidation {
  issues: ValidationIssue[];
  canPublish: boolean;
}

export interface CaseContentReview {
  reviewer: string;
  reviewedOn: string | null;
  reference: string;
}

/** La última solicitud de revisión del caso y, si ya se decidió, su decisión. */
export interface CaseReviewInfo {
  requestedBy: string | null;
  requestedAt: string;
  decision?: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  note?: string;
  reason?: 'FORMA' | 'CONTENIDO';
  contentReview?: CaseContentReview;
}

export interface CaseLifecycle {
  caseVersionId: number;
  state: CaseLifecycleState;
  allowedTransitions: CaseLifecycleAction[];
  /** Por qué no se puede enviar o aprobar (solo cuando esas acciones están permitidas y hay algo que lo impide). */
  blockedReason?: { code: string; message: string };
  review?: CaseReviewInfo;
}

/** Lo que lleva cada transición (`revision` viaja en la cabecera `X-Case-Revision`, no aquí). */
export interface CaseTransitionRequest {
  action: CaseLifecycleAction;
  note?: string;
  reason?: 'FORMA' | 'CONTENIDO';
  scope?: 'version' | 'case';
  contentReview?: CaseContentReview;
}
