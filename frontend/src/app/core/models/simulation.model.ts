export interface CatalogItem {
  caseVersionId: number;
  code: string;
  title: string;
  description: string;
  order: number;
  unlocked: boolean;
  completed: boolean;
  locked: boolean;
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
  accumulatedScore: number;
  stressIndex: number;
  metrics: SimulationMetrics;
  clinicalState?: ClinicalState;
  currentNode: SimulationNodeState;
  feedback: SimulationFeedback | null;
  completionReport: AttemptCompletionReport | null;
  supportResources: string[];
}

export interface SimulationMetrics {
  professionalScore: number;
  sceneStress: number;
  victimRisk: number;
  userTrust: number;
  institutionalRouteActivated: boolean;
  revictimizationRisk: boolean;
}

export interface ClinicalState {
  papApplied: boolean;
  patient: PatientState;
}

export interface AttemptTimelineEntry {
  atSeconds: number | null;
  time: string;
  type: string;
  classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE' | null;
  prohibited: boolean;
  label: string;
  scoreDelta: number;
  stressDelta: number;
}

export interface AttemptCompletionReport {
  attemptId: string;
  caseTitle: string;
  status: SimulationAttemptState['status'];
  finalScore: number;
  finalStress: number;
  metrics: SimulationMetrics;
  totalDurationSeconds: number | null;
  phaseDurations: PhaseDuration[];
  adequateDecisions: number;
  riskyDecisions: number;
  inadequateDecisions: number;
  prohibitedDecisions: number;
  toolsUsed: number;
  reflectionsCount: number;
  safeExitUsed: boolean;
  visitedNodeTitles: string[];
  competencies: string[];
  recommendations: string[];
  summaryMessage: string;
  /** Línea de tiempo de decisiones/acciones clave (backend puede omitirla). */
  timeline?: AttemptTimelineEntry[];
  /** Efecto mariposa: final canónico del caso (solo intentos COMPLETED). */
  ending?: AttemptEnding | null;
  /** Veces que una primera respuesta riesgosa no se aplicó (reintentos); no cuentan como decisiones registradas. */
  retries?: number;
  /** De esos reintentos, los que eran conducta prohibida (el docente los distingue en su traza). */
  prohibitedRetries?: number;
}

export interface AttemptEnding {
  key: 'integral' | 'brechas' | 'riesgo' | 'critico';
  title: string;
  message: string;
  tone: 'positive' | 'neutral' | 'warning' | 'critical';
  severityCounts: Record<'recommended' | 'acceptable' | 'risky' | 'critical', number>;
  caseFlags: Record<string, boolean>;
  caseMetrics: Record<string, number>;
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
  options: SimulationDecisionOption[];
}

/** Solo `id` y `text`: el servidor no manda la clasificación de una opción antes de elegirla (evaluación formativa). */
export interface SimulationDecisionOption {
  id: number;
  text: string;
}

export interface SimulationFeedback {
  classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE';
  scoreDelta: number;
  stressDelta: number;
  trustDelta: number;
  victimRiskDelta: number;
  prohibitedConduct: boolean;
  institutionalRouteActivated: boolean;
  revictimizationRisk: boolean;
  message: string;
  prohibitionReason: string | null;
  /** True solo cuando el backend concede otra oportunidad (1ª respuesta mala).
   *  En la 2ª respuesta riesgosa/inadecuada queda registrada y llega en false. */
  retryRequired?: boolean;
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
 * The stress delta and feedback message make the tool usage diegetic.
 */
export interface ToolUseResult {
  world: SimulationWorldState;
  toolCode: string;
  targetKey: string | null;
  pertinent: boolean;
  stressDelta: number;
  feedbackMessage: string;
}

export interface AttemptTrace {
  attemptId: string;
  studentAlias: string;
  caseTitle: string;
  status: string;
  accumulatedScore: number;
  stressIndex: number;
  metrics: SimulationMetrics;
  startedAt: string;
  endedAt: string | null;
  totalDurationSeconds: number | null;
  phaseDurations: PhaseDuration[];
  adequateDecisions: number;
  riskyDecisions: number;
  inadequateDecisions: number;
  prohibitedDecisions: number;
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
}

export interface TraceEvent {
  type: string;
  classification: string | null;
  nodeTitle: string | null;
  decisionText: string | null;
  scoreDelta: number;
  stressDelta: number;
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
  /** Solo viaja si el servidor tiene activo `RUBRIC_NUMERIC_TOTAL` (apagado por defecto: ED-2, RN-09). */
  totalScore: number | null;
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
  accumulatedScore: number;
  stressIndex: number;
  startedAt: string;
}

export interface StudentAttemptSummary {
  attemptId: string;
  caseVersionId: number;
  caseTitle: string;
  status: SimulationAttemptState['status'];
  accumulatedScore: number;
  adequateDecisions: number;
  riskyDecisions: number;
  inadequateDecisions: number;
  prohibitedDecisions: number;
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
  /** Solo viaja con `RUBRIC_NUMERIC_TOTAL` encendido en el servidor; si es null la pantalla no muestra ningún número. */
  totalScore: number | null;
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
  maxScore: number;
  displayOrder: number;
}

export interface CriterionScoreView {
  criterionId: number;
  score: number;
  /** Nivel formativo de este criterio (el que se muestra; `score` es su índice interno o la calificación 1,0–5,0). */
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
}

export interface DecisionEdgeState {
  id: number;
  optionKey: string;
  sourceNodeId: number;
  sourceKey: string;
  targetNodeId: number;
  targetKey: string;
  text: string;
  classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE';
  prohibitedConduct: boolean;
  prohibitionReason: string | null;
  scoreDelta: number;
  stressDelta: number;
  prohibitedPenalty: number;
  immediateFeedback: string;
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
  nodes: NodeEditorState[];
  decisions: DecisionEdgeState[];
  maps: MapEditorState[];
  objects: MapObjectEditorState[];
  tools: ClinicalToolEditorState[];
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
}

export interface DecisionOptionUpsertRequest {
  sourceNodeId: number;
  targetNodeId: number;
  optionKey: string;
  text: string;
  classification: string;
  prohibitedConduct: boolean;
  prohibitionReason: string | null;
  scoreDelta: number;
  stressDelta: number;
  prohibitedPenalty: number;
  immediateFeedback: string;
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

// ─── Patient Reactive System (Plan 3) ─────────────────────────────────────────

export interface PatientState {
  /** Overall emotional wellbeing: 0 = crisis, 100 = stable/open. Starts at 40. */
  emotionalState: number;
  /** Trust in the professional: 0 = none, 100 = full. Starts at 20. */
  trustLevel: number;
  /** Willingness to open up: 0 = closed, 100 = fully open. Starts at 15. */
  openness: number;
  /** Crisis intensity: 0 = resolved, 100 = acute crisis. Starts at 60. */
  crisisLevel: number;
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
