// ARCHIVO GENERADO AUTOMÁTICAMENTE DESDE EL CONTRATO OPENAPI (E5-9 · DJG-6).
// No editar a mano: regenerar con `node scripts/openapi/generate-types.mjs`.

/** La decisión de acceso del estudiante a una versión de caso: si puede empezar y, si no, por qué. */
export interface AccessDecision {
  readonly allowed: boolean;
  /** Cierre de la ventana. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly closesAt?: string;
  /** Apertura de la ventana. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly opensAt?: string;
  /** Solo si `allowed` es falso. */
  readonly reason?: AccessReasonEnum;
}

export type AccessReasonEnum = 'NOT_ASSIGNED' | 'NOT_YET_OPEN' | 'CLOSED' | 'LOCKED_BY_SEQUENCE';

export type ActivationEnum = 'CALM' | 'TENSE' | 'CRISIS';

/** RQ-NEG-002 · estudiantes con algún intento cuyas competencias con nivel están todas en el nivel aceptable o más. */
export interface AnalyticsAcceptable {
  readonly achieved: number;
  /** El nivel aceptable con el que se calculó. */
  readonly levelThreshold: FormativeLevelEnum;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
  /** Estudiantes con al menos un intento con alguna competencia con nivel. */
  readonly students: number;
}

/** Quién aporta datos. Con `suppressed` verdadero solo viajan este bloque y `definitions`. */
export interface AnalyticsCohort {
  /** Intentos completados en el alcance. */
  readonly attempts: number;
  /** Estudiantes distintos con al menos un intento completado en el alcance. */
  readonly students: number;
  /** Verdadero si hay menos estudiantes que la celda mínima. */
  readonly suppressed: boolean;
}

/** Con qué reglas se calculó. Mientras `status` sea `BORRADOR` ninguna cifra es oficial. */
export interface AnalyticsDefinitions {
  readonly acceptableLevel: FormativeLevelEnum;
  /** Celda mínima: estudiantes distintos que hacen falta para publicar un bloque. */
  readonly minCell: number;
  /** Versión de la regla que convierte decisiones en niveles; solo se cuentan los intentos calculados con ella. */
  readonly profileRules: string;
  readonly reflectionDefinition: ReflectionDefinitionEnum;
  readonly status: AnalyticsDefinitionsStatusEnum;
}

export type AnalyticsDefinitionsStatusEnum = 'BORRADOR';

/** RQ-NEG-005 · intentos con evaluación automática completa y con evaluación del docente comentada. */
export interface AnalyticsEvaluated {
  readonly attempts: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly commentedPct: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly systemPct: number;
}

/** RQ-NEG-003 · decisiones no recomendadas del primer frente al segundo intento (se omite si el primero no tuvo). */
export interface AnalyticsFirstVsSecond {
  /** Media de no recomendadas del primer intento, con dos decimales. */
  readonly firstMean: number;
  /** Cambio de la media. Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly nonRecommendedDeltaPct: number;
  /** Media de no recomendadas del segundo intento, con dos decimales. */
  readonly secondMean: number;
  readonly series: number;
  readonly students: number;
}

/** RQ-NEG-001 · primer frente al último intento de cada serie (estudiante, caso) con al menos dos intentos. */
export interface AnalyticsImprovement {
  /** Mejora como porcentaje del recorrido posible (3 puntos). Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly deltaPct: number;
  /** Media del índice del último intento. Índice interno de 1 a 4 (no es una nota), con dos decimales. */
  readonly post: number;
  /** Media del índice del primer intento. Índice interno de 1 a 4 (no es una nota), con dos decimales. */
  readonly pre: number;
  readonly series: number;
  readonly students: number;
}

/** RQ-NEG-005 · mejora entre intentos consecutivos cuando se vio la retroalimentación antes del siguiente. */
export interface AnalyticsImprovementAfterFeedback {
  /** Mejora como porcentaje del recorrido posible (3 puntos). Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly deltaPct: number;
  readonly pairs: number;
  readonly students: number;
}

/** RQ-NEG-004 · intentos que son evidencia clave de aprendizaje (completados, con reflexión y con perfil). */
export interface AnalyticsKeyEvidence {
  readonly attempts: number;
  readonly keyEvidence: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
}

/** Cobertura de un hito del caso entre los intentos cerrados que traen hitos (reporte v3): ¿lo cumplió la mayoría? */
export interface AnalyticsMilestone {
  /** `MAYORIA` si al menos la mitad de los intentos lo cumplió. */
  readonly category: CategoryEnum;
  /** Verdadero si el hito decide el final del caso. */
  readonly decisive: boolean;
  readonly key: string;
  /** La del caso; si la consulta abarca varias versiones, la propia clave. */
  readonly label: string;
  /** Solo con 20 estudiantes distintos o más; antes, nulo (un porcentaje identifica a personas). Porcentaje de 0 a 100, con un decimal. */
  readonly share: number | null;
}

/** RQ-NEG-003 · intentos con reflexión, según la definición vigente (los cerrados con otra no se mezclan). */
export interface AnalyticsReflection {
  readonly attempts: number;
  readonly covered: number;
  readonly definition: ReflectionDefinitionEnum;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
}

/** RQ-NEG-004 · respuestas de la encuesta con 4 o 5 de 5. Solo existe con la encuesta encendida. */
export interface AnalyticsSatisfaction {
  readonly responses: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly satisfiedPct: number;
}

/** Sobre de éxito de la API: `{success, message?, data?}` (`shared.response.envelope`). `message` y `data` solo viajan cuando tienen valor. Los endpoints que aún no se tipan llevan este sobre con `data` sin forma. */
export interface ApiEnvelope {
  readonly data?: unknown;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Una versión de caso asignada, con su ventana de apertura y cierre (C7). */
export interface Assignment {
  /** Una asignación en pausa no habilita nada. */
  readonly active: boolean;
  readonly caseVersionId: number;
  /** Si no hay fecha, no viaja. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly closesAt?: string;
  readonly id: number;
  /** Si no hay fecha, no viaja. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly opensAt?: string;
  /** Su lugar en la secuencia de casos. */
  readonly sortOrder: number;
  /** Dónde está la ventana hoy. */
  readonly state: AssignmentStateEnum;
  readonly target: AssignmentTarget;
}

/** Sobre de éxito: `data` es `Assignment`. */
export interface AssignmentEnvelope {
  readonly data: Assignment;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Sobre de éxito: `data` es una lista de `Assignment`. */
export interface AssignmentListEnvelope {
  readonly data: ReadonlyArray<Assignment>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AssignmentStateEnum = 'SCHEDULED' | 'OPEN' | 'CLOSED';

/** A quién se asignó el caso: a un grupo o, directamente, a un estudiante. */
export interface AssignmentTarget {
  /** Solo si `type` es `GROUP`. */
  readonly groupId?: number;
  /** Solo si `type` es `STUDENT`. */
  readonly studentId?: number;
  readonly type: AssignmentTargetTypeEnum;
}

export type AssignmentTargetTypeEnum = 'GROUP' | 'STUDENT';

/** La respuesta del asistente de IA: un objeto con el texto, SIN el sobre `{success, data}` de las demás rutas. */
export interface AssistantAnswer {
  readonly response: string;
}

/** El estado del intento (inicio, lectura, reanudación): la escena, la persona y, al completar, el informe congelado. Ninguna cifra llega al estudiante: ni puntaje, ni estrés, ni métricas, ni estado clínico (`test_no_numbers_to_student`). La respuesta lleva además `attemptToken` (la credencial del intento, que el cliente reenvía en la cabecera): este contrato NO la declara a propósito, porque el documento no publica ninguna propiedad con nombre de credencial (`test_openapi_schema_never_exposes_prohibited_fields`). Su prueba la admite como la única clave de más. */
export interface AttemptState {
  /** UUID del intento. */
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** El informe congelado (schemaVersion 3) de un intento completado; nulo mientras no lo está. Su forma (hitos, persona, final con su razón, revisión de decisiones, niveles con su evidencia) la fija `attempt_report`; tiparla campo a campo queda fuera de este contrato. */
  readonly completionReport: Readonly<Record<string, unknown>> | null;
  readonly currentNode: CurrentNode;
  readonly persona: PersonaState;
  readonly status: AttemptStatusEnum;
  /** Recursos de apoyo: solo si el intento está en pausa o salió de forma segura. */
  readonly supportResources: ReadonlyArray<string>;
}

/** Sobre de éxito: `data` es `AttemptState`. */
export interface AttemptStateEnvelope {
  readonly data: AttemptState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AttemptStatusEnum = 'IN_PROGRESS' | 'PAUSED' | 'SAFE_EXITED' | 'COMPLETED' | 'REPLACED';

/** Página de auditoría, de la más reciente a la más antigua, con el resumen de calidad de las revisiones. */
export interface AuditList {
  readonly coverage: PageCoverage;
  readonly items: ReadonlyArray<AuditLogItem>;
  readonly page: number;
  readonly pageSize: number;
  /** Días que se conserva la auditoría (nunca menos de 360). */
  readonly retentionDays: number;
  readonly reviewQuality: ReviewQuality;
}

/** Sobre de éxito: `data` es `AuditList`. */
export interface AuditListEnvelope {
  readonly data: AuditList;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Una fila de la auditoría. Los campos opcionales son nulos en los eventos de sistema (sin actor ni recurso). */
export interface AuditLogItem {
  /** Código tal como se guardó (`entidad.verbo` o el legado). */
  readonly action: string;
  readonly actorId: number | null;
  readonly actorRole: string | null;
  /** Contexto libre de la acción (método, clase, taxonomía…). */
  readonly context: Readonly<Record<string, unknown>>;
  readonly id: number;
  readonly ipAddress: string | null;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly occurredAt: string;
  readonly resourceId: string | null;
  readonly resourceType: string | null;
  /** Hasta cuándo se conserva la fila. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly retentionUntil: string;
  /** El código canónico `entidad.verbo` de la acción. */
  readonly taxonomy: string;
  readonly userAgent: string | null;
}

export type BackingEnum = 'system' | 'constancia' | 'author';

export type BondEnum = 'WITHDRAWN' | 'GUARDED' | 'OPEN';

/** Un personaje que Psicología marcó para la ficha del caso. */
export interface BriefCharacter {
  readonly displayName: string;
  readonly id: number;
  /** Puede venir vacío. */
  readonly portraitKey: string;
  /** Puede venir vacío. */
  readonly roleLabel: string;
}

/** Un bloqueo de publicación: la lista incompleta o los errores de validación (con sus hallazgos). */
export interface CaseBlocker {
  readonly code: string;
  /** Solo en `VALIDATION_ERRORS`. */
  readonly issues?: ReadonlyArray<ValidationIssue>;
  readonly message: string;
}

/** La ficha del caso: lo que el estudiante lee antes de jugar. No crea intento. */
export interface CaseBrief {
  readonly access: AccessDecision;
  readonly caseVersionId: number;
  readonly characters: ReadonlyArray<BriefCharacter>;
  /** Puede venir vacío. */
  readonly context: string;
  readonly hasSensitiveContent: boolean;
  readonly learningObjectives: ReadonlyArray<string>;
  readonly title: string;
}

/** Sobre de éxito: `data` es `CaseBrief`. */
export interface CaseBriefEnvelope {
  readonly data: CaseBrief;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La lista de publicación del caso con quién respalda cada casilla (S3-3): la misma que trae el editor. */
export interface CaseChecklist {
  readonly contentReview: ChecklistContentReview;
  readonly items: ReadonlyArray<ChecklistItem>;
  /** Si rige la revisión de contenido de Psicología (`SIEP_REVIEW_WORKFLOW_STRICT`): publicar exige la constancia. */
  readonly strict: boolean;
}

/** El 409 de una transición del caso. Cada motivo suma sus campos en la raíz: `INVALID_TRANSITION` → `state` y `action`; `CASE_NOT_PUBLISHABLE` → `blockers`; `REVISION_CONFLICT` → `revision` y `current` (el editor tal como está ahora). */
export interface CaseConflictEnvelope {
  readonly action?: LifecycleActionEnum;
  readonly blockers?: ReadonlyArray<CaseBlocker>;
  readonly code: string;
  /** El editor del caso con los cambios de la otra sesión. */
  readonly current?: Readonly<Record<string, unknown>>;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** La revisión vigente del caso. */
  readonly revision?: number;
  readonly state?: CaseVersionStatusEnum;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** El documento de una versión (borrador o publicada) con su hash, su sello y su reutilización. */
export interface CaseDefinition {
  /** El documento del caso: el mismo formato que se exporta y se importa. */
  readonly definition: Readonly<Record<string, unknown>>;
  /** Hash del documento tal como está ahora (`sha256:<hex>`). */
  readonly definitionHash: string;
  /** Qué parte del caso reutiliza de su versión anterior (0 a 1); solo un clon publicado. */
  readonly reuseRatio: number | null;
  /** El hash que se selló al publicar; nulo en lo que no tiene sello. */
  readonly sealedHash: string | null;
  /** Solo lo sellado la tiene. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly validatedAt: string | null;
}

/** Sobre de éxito: `data` es `CaseDefinition`. */
export interface CaseDefinitionEnvelope {
  readonly data: CaseDefinition;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El borrador que creó la importación y los avisos del documento (lo que no se guarda). */
export interface CaseImported {
  readonly caseId: number;
  readonly caseVersionId: number;
  /** Solo avisos: con algún error no se crea nada. */
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/** Sobre de éxito: `data` es `CaseImported`. */
export interface CaseImportedEnvelope {
  readonly data: CaseImported;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El ciclo de vida de una versión: su estado, lo que esta persona puede hacer, su lista de publicación y la última revisión (C4). */
export interface CaseLifecycle {
  /** Las acciones que esta persona puede hacer hoy. */
  readonly allowedTransitions: ReadonlyArray<LifecycleActionEnum>;
  /** Solo si puede enviar o aprobar y algo lo impide. */
  readonly blockedReason?: LifecycleBlockedReason;
  /** En `clone`, la versión NUEVA que se creó. */
  readonly caseVersionId: number;
  /** La lista de publicación con el respaldo de cada casilla: quien revisa la ve sin pedir el caso entero (S3-3). */
  readonly checklist: CaseChecklist;
  /** Solo si la versión ya tuvo una revisión. */
  readonly review?: CaseReview;
  readonly state: CaseVersionStatusEnum;
}

/** Sobre de éxito: `data` es `CaseLifecycle`. */
export interface CaseLifecycleEnvelope {
  readonly data: CaseLifecycle;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La última revisión de la versión. Mientras nadie la decide solo trae quién la pidió y cuándo. */
export interface CaseReview {
  /** Solo si la aprobación trae constancia. */
  readonly contentReview?: ContentReview;
  /** Solo si ya se decidió. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly decidedAt?: string | null;
  readonly decidedBy?: string | null;
  /** Solo si ya se decidió. */
  readonly decision?: ReviewDecisionEnum;
  /** Solo si ya se decidió; puede venir vacía. */
  readonly note?: string;
  /** Solo si se devolvió a borrador. */
  readonly reason?: ReviewReasonEnum;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly requestedAt: string;
  readonly requestedBy: string | null;
}

/** El resultado de validar una versión: sus hallazgos y si puede publicarse. */
export interface CaseValidation {
  /** Falso mientras haya algún error; los avisos no impiden publicar. */
  readonly canPublish: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/** Sobre de éxito: `data` es `CaseValidation`. */
export interface CaseValidationEnvelope {
  readonly data: CaseValidation;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type CaseVersionStatusEnum = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

export type CategoryEnum = 'MAYORIA' | 'MENOS_DE_LA_MITAD';

/** La constancia de Psicología vista desde la lista: si existe y, cuando existe, sus datos. */
export interface ChecklistContentReview {
  readonly fulfilled: boolean;
  /** El acta o la referencia de la revisión. Solo si ya hay constancia. */
  readonly reference?: string;
  /** Solo si ya hay constancia. */
  readonly reviewedOn?: string | null;
  /** Solo si ya hay constancia. */
  readonly reviewer?: string;
}

/** Un ítem de la lista de publicación y quién lo respalda (S3-3). */
export interface ChecklistItem {
  /** Si el dato que lo respalda existe ahora; `null` si es solo una declaración. */
  readonly backed: boolean | null;
  /** Quién lo respalda: el sistema, la constancia de Psicología o solo la declaración de quien autora. */
  readonly backing: BackingEnum;
  /** El respaldo en lenguaje llano, para mostrarlo tal cual. */
  readonly backingLabel: string;
  /** Estable: `contentOriginal`, `ethicsReviewed`, `safetyProtocols`… */
  readonly code: string;
  /** Su texto es un borrador pendiente de la validación de Psicología. */
  readonly draft: boolean;
  /** Si la última lista guardada lo tiene marcado. */
  readonly fulfilled: boolean;
  readonly label: string;
  /** Si la publicación lo exige hoy: seis ítems, o siete con la revisión de contenido. */
  readonly required: boolean;
}

/** Cuerpo de `POST …/consent`: la versión del aviso que la persona vio. */
export interface ConsentAcceptRequest {
  /** La versión del aviso que el cliente mostró. Si no es la vigente en el servidor, 409 `NOTICE_VERSION_STALE`. */
  readonly noticeVersion: string;
}

/** El error de un aviso de otra versión (409 `NOTICE_VERSION_STALE`): el sobre de error con la versión vigente en la raíz. Es la forma real del 409 (sin `field`, que es de la validación de campos): por eso no extiende a `ErrorEnvelope`. */
export interface ConsentNoticeError {
  /** Estable: `NOTICE_VERSION_STALE`. */
  readonly code: string;
  readonly message: string;
  /** La versión VIGENTE del aviso en el servidor. */
  readonly noticeVersion: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** La aceptación registrada (`POST …/consent`): 201 si es nueva y 200 si ya existía, con la misma forma. */
export interface ConsentRecord {
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly acceptedAt: string;
  readonly caseVersionId: number;
  /** La versión del aviso que quedó aceptada. */
  readonly noticeVersion: string;
}

/** Sobre de éxito: `data` es `ConsentRecord`. */
export interface ConsentRecordEnvelope {
  readonly data: ConsentRecord;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El consentimiento de la persona al aviso de contenido de una versión del caso (`GET …/consent`). */
export interface ConsentState {
  /** Si la persona tiene una aceptación vigente de esa versión del aviso. */
  readonly accepted: boolean;
  /** Nulo si no ha aceptado. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly acceptedAt: string | null;
  /** La versión VIGENTE del aviso en el servidor. */
  readonly noticeVersion: string;
  /** Si el servidor exige el consentimiento para jugar (`SIEP_CONSENT_REQUIRED`). */
  readonly required: boolean;
}

/** Sobre de éxito: `data` es `ConsentState`. */
export interface ConsentStateEnvelope {
  readonly data: ConsentState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El retiro del consentimiento (`DELETE …/consent`). Idempotente: sin nada vigente responde 200 con `withdrawnAt` nulo. */
export interface ConsentWithdrawal {
  readonly caseVersionId: number;
  /** Nulo si no había nada vigente que retirar. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly withdrawnAt: string | null;
}

/** Sobre de éxito: `data` es `ConsentWithdrawal`. */
export interface ConsentWithdrawalEnvelope {
  readonly data: ConsentWithdrawal;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La constancia de la revisión de contenido de Psicología. */
export interface ContentReview {
  /** El acta o la referencia de la revisión. */
  readonly reference: string;
  readonly reviewedOn: string | null;
  readonly reviewer: string;
}

/** La escena actual del intento. ``options`` va vacía si el intento no está en juego o la escena es terminal. */
export interface CurrentNode {
  readonly decisionPrompt: string;
  readonly displayOrder: number;
  readonly id: number;
  /** Cuánta carga emocional trae la escena. */
  readonly intensity: IntensityEnum;
  readonly key: string;
  readonly narrative: string;
  readonly options: ReadonlyArray<DecisionOptionState>;
  readonly requiredTools: ReadonlyArray<string>;
  readonly safeExitRequired: boolean;
  readonly sensitiveContent: boolean;
  readonly supportResources: ReadonlyArray<string>;
  readonly terminal: boolean;
  readonly title: string;
  readonly warningMessage: string | null;
}

/** Una opción de decisión tal como la ve quien juega: solo su id y su texto (ni clase ni efectos, antes de decidir). */
export interface DecisionOptionState {
  readonly id: number;
  readonly text: string;
}

/** Sobre de error de la API: `{success: false, code, message, field?}` (`shared.exceptions`). `code` es estable: el cliente decide por él, nunca por el texto. Algunos errores de dominio suman campos propios en la raíz (`existingAttemptId`, `nodeId`…). */
export interface ErrorEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

export type FormativeLevelEnum = 'EN_INICIO' | 'EN_PROCESO' | 'LOGRADO' | 'DESTACADO';

/** El estado mínimo del servicio. No devuelve nada interno: ni versiones ni el texto del error de la base. */
export interface Health {
  readonly db: HealthDbEnum;
  readonly status: HealthStatusEnum;
}

export type HealthDbEnum = 'ok' | 'error';

/** Sobre de éxito: `data` es `Health`. */
export interface HealthEnvelope {
  readonly data: Health;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type HealthStatusEnum = 'ok' | 'degraded';

export type HintReasonEnum = 'NONE_FOR_SCENE' | 'ALL_SHOWN';

/** Las pistas de la escena actual: las que el intento ya pidió y cuántas quedan. Es también lo que responde `POST …/hints/next`: el estado DESPUÉS de pedir (o, si la orden se repitió o cayó dentro de la ventana de duplicado, el mismo estado sin revelar otra). */
export interface HintState {
  /** Cuántas quedan por pedir en esta escena. */
  readonly available: number;
  /** Solo si no quedan: la escena no tiene o ya se pidieron todas. */
  readonly reason?: HintReasonEnum;
  readonly shown: ReadonlyArray<ShownHint>;
}

/** Sobre de éxito: `data` es `HintState`. */
export interface HintStateEnvelope {
  readonly data: HintState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El sobre de error de una importación rechazada (`DSL_INVALID`): lleva los hallazgos en la raíz. */
export interface ImportRejectedEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly message: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** Un intento en la revisión docente. El estudiante se identifica solo por su alias (nunca por su id). */
export interface InstructorAttemptItem {
  readonly activeSeconds: number;
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  readonly caseVersionStatus: CaseVersionStatusEnum;
  /** Nulo mientras el intento está abierto. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly endedAt: string | null;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly startedAt: string;
  readonly status: AttemptStatusEnum;
  /** `Estudiante-<hash>`: el mismo en todas las vistas del docente. */
  readonly studentAlias: string;
}

/** Página de intentos dentro del alcance del docente, del más reciente al más antiguo. */
export interface InstructorAttemptsList {
  readonly coverage: PageCoverage;
  readonly items: ReadonlyArray<InstructorAttemptItem>;
  readonly page: number;
  readonly pageSize: number;
}

/** Sobre de éxito: `data` es `InstructorAttemptsList`. */
export interface InstructorAttemptsListEnvelope {
  readonly data: InstructorAttemptsList;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type IntensityEnum = 'LOW' | 'MEDIUM' | 'HIGH';

/** La membresía del estudiante en un grupo: pendiente de respuesta, aceptada o rechazada. El listado no trae las retiradas (`REMOVED`), pero la respuesta de `leave` (y la de aceptar o rechazar) sí devuelve la membresía tal como quedó, también con ese estado. */
export interface Invitation {
  readonly groupId: number;
  readonly groupName: string;
  /** Igual a `groupId`: la membresía es `(grupo, estudiante)`. */
  readonly id: number;
  /** Hora local del servidor (America/Bogota), sin zona. Nula en las membresías anteriores a las invitaciones. */
  readonly invitedAt: string | null;
  readonly status: MembershipStatusEnum;
  /** Nombre completo del docente del grupo, quien invita. */
  readonly teacherName: string;
}

/** Sobre de éxito: `data` es `Invitation`. */
export interface InvitationEnvelope {
  readonly data: Invitation;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Sobre de éxito: `data` es una lista de `Invitation`. */
export interface InvitationListEnvelope {
  readonly data: ReadonlyArray<Invitation>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type IssueSeverityEnum = 'error' | 'warning';

/** Los agregados de aprendizaje del alcance pedido. Cada bloque falta si no alcanza la celda mínima. */
export interface LearningAnalytics {
  readonly acceptable?: AnalyticsAcceptable;
  readonly cohort: AnalyticsCohort;
  readonly definitions: AnalyticsDefinitions;
  readonly evaluated?: AnalyticsEvaluated;
  readonly firstVsSecond?: AnalyticsFirstVsSecond;
  readonly improvement?: AnalyticsImprovement;
  readonly improvementAfterFeedback?: AnalyticsImprovementAfterFeedback;
  readonly keyEvidence?: AnalyticsKeyEvidence;
  readonly milestones?: ReadonlyArray<AnalyticsMilestone>;
  readonly reflectionCoverage?: AnalyticsReflection;
  readonly satisfaction?: AnalyticsSatisfaction;
}

/** Sobre de éxito: `data` es `LearningAnalytics`. */
export interface LearningAnalyticsEnvelope {
  readonly data: LearningAnalytics;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type LifecycleActionEnum = 'submit' | 'approve' | 'reject' | 'archive' | 'clone';

/** Por qué hoy no se puede enviar a revisión ni aprobar: el primer bloqueo. */
export interface LifecycleBlockedReason {
  /** Estable: `CHECKLIST_INCOMPLETE`, `VALIDATION_ERRORS`… */
  readonly code: string;
  readonly message: string;
}

/** El 409 de responder una invitación (`MEMBERSHIP_NOT_INVITED`, `MEMBERSHIP_NOT_ACTIVE`): trae el estado de hoy. */
export interface MembershipConflictEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** El estado en que está la membresía hoy. */
  readonly status: MembershipStatusEnum;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

export type MembershipStatusEnum = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REMOVED';

/** Cuántos resultados trae la página (`shown`) y cuántos hay en total (`total`). */
export interface PageCoverage {
  readonly shown: number;
  readonly total: number;
}

/** La persona consultante en palabras: su vínculo y su activación en la ficción, sin cifras. */
export interface PersonaState {
  readonly activation: ActivationEnum;
  readonly bond: BondEnum;
  /** La frase para el estudiante: «se muestra cautelosa y tensa». */
  readonly label: string;
}

/** Posición del jugador en el mapa, en píxeles. */
export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
}

export type ReflectionDefinitionEnum = 'ANY' | 'PER_DECISION_SCENE';

/** Un intento del estudiante con sus tiempos y su n.º de intento en el caso. */
export interface ReportAttempt {
  /** Tiempo de juego real: lo que el estudiante estuvo en el caso. */
  readonly activeSeconds: number;
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** De reloj, entre el inicio y el cierre; nulo mientras el intento está abierto. */
  readonly clockSeconds: number | null;
  /** El n.º de intento del estudiante en el CASO (todas sus versiones). */
  readonly ordinal: number;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly startedAt: string;
  readonly status: AttemptStatusEnum;
}

/** El estudiante del reporte. `ref` es `Estudiante-<id>` (su id numérico) y NO el alias `Estudiante-<hash>` que la revisión docente muestra en `studentAlias`: los dos no se pueden cruzar. */
export interface ReportStudent {
  readonly displayName: string;
  readonly ref: string;
}

export type ReviewDecisionEnum = 'APPROVED' | 'REJECTED';

/** Devoluciones por CONTENIDO frente a FORMA entre las revisiones decididas (alarma de sello de goma). */
export interface ReviewQuality {
  readonly approved: number;
  /** Devueltas por contenido / decididas (0 a 1). */
  readonly contentRejectionRate: number;
  readonly decidedReviews: number;
  /** Devueltas por forma / decididas (0 a 1). */
  readonly formRejectionRate: number;
  readonly rejectedByContent: number;
  readonly rejectedByForm: number;
  readonly rejectedTotal: number;
  readonly rubberStampAlarm: boolean;
}

export type ReviewReasonEnum = 'FORMA' | 'CONTENIDO';

/** Una pista que el intento ya pidió. El texto de las que no pidió nunca sale. */
export interface ShownHint {
  readonly id: number;
  readonly order: number;
  readonly text: string;
}

/** El reporte de un estudiante para su docente (C3): los intentos más recientes y cuántos hay en total. */
export interface StudentReport {
  readonly attempts: ReadonlyArray<ReportAttempt>;
  /** «Mostrando `shown` de `total`»: los intentos que trae y los que hay. */
  readonly coverage: PageCoverage;
  readonly student: ReportStudent;
}

/** Sobre de éxito: `data` es `StudentReport`. */
export interface StudentReportEnvelope {
  readonly data: StudentReport;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Lo que el estudiante envía: la calificación y, si quiere, un comentario (la validación es del servicio). */
export interface SurveyRequest {
  /** Texto plano, sin marcado ni enlaces. */
  readonly comment?: string;
  /** Entero de 1 a 5. */
  readonly rating: number;
}

/** La encuesta breve de un intento: si ya se respondió y, en ese caso, qué respondió. */
export interface SurveyState {
  /** Solo si ya respondió; puede ser vacío. */
  readonly comment?: string;
  /** Solo si ya respondió. */
  readonly rating?: number;
  readonly submitted: boolean;
  /** Solo si ya respondió. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly submittedAt?: string;
}

/** Sobre de éxito: `data` es `SurveyState`. */
export interface SurveyStateEnvelope {
  readonly data: SurveyState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Un hallazgo del validador. El mensaje está en lenguaje llano: nombra los elementos por su título, sin ids. */
export interface ValidationIssue {
  /** Estable: `DSL.OCL-02`, `WORLD.OPTION_WITHOUT_TRIGGER`… */
  readonly code: string;
  /** El mapa al que el editor lleva el foco. */
  readonly mapId?: number;
  readonly message: string;
  /** La escena a la que el editor lleva el foco. */
  readonly nodeId?: number;
  /** Dónde está en el documento (`DSL.*`); no viaja si el hallazgo es del documento entero. */
  readonly path?: string;
  readonly severity: IssueSeverityEnum;
}

/** Acuse de la posición guardada (E5-1): sin releer objetos, diálogos ni herramientas. Si la sala del cliente ya no es la actual, la respuesta es el mundo completo: estas mismas claves y además `objects`, `collisions`, `tools`, `inventory`… El cliente solo debe leer de aquí `map.key` y `player`. */
export interface WorldPatchAck {
  readonly attemptId: string;
  readonly map: WorldPatchAckMap;
  readonly player: PlayerPosition;
  readonly status: AttemptStatusEnum;
}

/** Sobre de éxito: `data` es `WorldPatchAck`. */
export interface WorldPatchAckEnvelope {
  readonly data: WorldPatchAck;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La sala en la que quedó guardado el jugador. */
export interface WorldPatchAckMap {
  readonly key: string;
}

export interface OpenApiPaths {
  readonly '/api/admin/access-requests': 'GET';
  readonly '/api/admin/access-requests/{request_id}/status': 'PATCH';
  readonly '/api/admin/audit': 'GET';
  readonly '/api/admin/cases': 'GET' | 'POST';
  readonly '/api/admin/cases/import': 'POST';
  readonly '/api/admin/cases/{case_version_id}/brief': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/characters': 'POST';
  readonly '/api/admin/cases/{case_version_id}/characters/{character_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/checklist': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/clone-version': 'POST';
  readonly '/api/admin/cases/{case_version_id}/decisions': 'POST';
  readonly '/api/admin/cases/{case_version_id}/decisions/{decision_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/definition': 'GET';
  readonly '/api/admin/cases/{case_version_id}/dialogues/{tree_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/editor': 'GET';
  readonly '/api/admin/cases/{case_version_id}/hints/{hint_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/lifecycle': 'GET' | 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/dialogues': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/hints': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/objects': 'POST';
  readonly '/api/admin/cases/{case_version_id}/nodes': 'POST';
  readonly '/api/admin/cases/{case_version_id}/nodes/reorder': 'PATCH';
  readonly '/api/admin/cases/{case_version_id}/nodes/{node_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/objects/{object_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/publish': 'POST';
  readonly '/api/admin/cases/{case_version_id}/rules/endings': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/rules/milestones': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/rules/risk': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/tools': 'POST';
  readonly '/api/admin/cases/{case_version_id}/tools/{tool_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/validate': 'POST';
  readonly '/api/admin/cases/{case_version_id}/world': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/world-editor': 'GET';
  readonly '/api/admin/cases/{case_version_id}/world-preview': 'GET';
  readonly '/api/admin/cases/{case_version_id}/world/validate': 'POST';
  readonly '/api/admin/users': 'GET' | 'POST';
  readonly '/api/admin/users/approve': 'POST';
  readonly '/api/admin/users/{user_id}': 'PUT';
  readonly '/api/admin/users/{user_id}/revoke-sessions': 'POST';
  readonly '/api/admin/users/{user_id}/status': 'PATCH';
  readonly '/api/assignments': 'GET' | 'POST';
  readonly '/api/assignments/{assignment_id}': 'DELETE' | 'PATCH';
  readonly '/api/auth/access-request': 'POST';
  readonly '/api/auth/change-password': 'POST';
  readonly '/api/auth/google': 'POST';
  readonly '/api/auth/google/config': 'GET';
  readonly '/api/auth/login': 'POST';
  readonly '/api/auth/logout': 'POST';
  readonly '/api/auth/me': 'GET';
  readonly '/api/authoring/cases': 'GET' | 'POST';
  readonly '/api/authoring/cases/import': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/brief': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/characters': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/characters/{character_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/checklist': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/clone-version': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/decisions': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/decisions/{decision_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/definition': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/dialogues/{tree_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/editor': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/hints/{hint_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/lifecycle': 'GET' | 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/dialogues': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/hints': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/objects': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/nodes': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/nodes/reorder': 'PATCH';
  readonly '/api/authoring/cases/{case_version_id}/nodes/{node_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/objects/{object_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/publish': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/rules/endings': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/rules/milestones': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/rules/risk': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/tools': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/tools/{tool_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/validate': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/world': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/world-editor': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/world-preview': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/world/validate': 'POST';
  readonly '/api/competencies': 'GET' | 'POST';
  readonly '/api/grupos': 'GET' | 'POST';
  readonly '/api/grupos/estudiantes/import/spec': 'GET';
  readonly '/api/grupos/estudiantes/import/template': 'GET';
  readonly '/api/grupos/{id}': 'DELETE' | 'PATCH' | 'PUT';
  readonly '/api/grupos/{id}/casos': 'GET' | 'POST';
  readonly '/api/grupos/{id}/casos/{case_version_id}': 'DELETE';
  readonly '/api/grupos/{id}/estudiantes': 'GET' | 'POST';
  readonly '/api/grupos/{id}/estudiantes/import': 'POST';
  readonly '/api/grupos/{id}/estudiantes/{estudiante_id}': 'DELETE';
  readonly '/api/grupos/{id}/estudiantes/{estudiante_id}/activar': 'POST';
  readonly '/api/health': 'GET';
  readonly '/api/instructor/attempts': 'GET';
  readonly '/api/instructor/attempts/recent': 'GET';
  readonly '/api/instructor/attempts/{attempt_id}/replace': 'POST';
  readonly '/api/instructor/attempts/{attempt_id}/rubric-evaluation': 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly '/api/instructor/attempts/{attempt_id}/trace': 'GET';
  readonly '/api/me/invitations': 'GET';
  readonly '/api/me/invitations/{group_id}/accept': 'POST';
  readonly '/api/me/invitations/{group_id}/decline': 'POST';
  readonly '/api/me/invitations/{group_id}/leave': 'POST';
  readonly '/api/reportes/analiticas': 'GET';
  readonly '/api/reportes/dashboard': 'GET';
  readonly '/api/reportes/estudiante/{estudiante_id}': 'GET';
  readonly '/api/reportes/grupo/{grupo_id}': 'GET';
  readonly '/api/reportes/grupo/{grupo_id}/export': 'GET';
  readonly '/api/rubrics': 'GET' | 'POST';
  readonly '/api/rubrics/case-versions/{case_version_id}': 'GET' | 'POST' | 'PUT';
  readonly '/api/rubrics/{rubric_id}': 'GET' | 'PATCH' | 'PUT';
  readonly '/api/rubrics/{rubric_id}/activate': 'POST';
  readonly '/api/rubrics/{rubric_id}/deactivate': 'POST';
  readonly '/api/rubrics/{rubric_id}/default': 'POST';
  readonly '/api/rubrics/{rubric_id}/duplicate': 'POST';
  readonly '/api/security/csp-report': 'POST';
  readonly '/api/simulation/ai-assistant': 'POST';
  readonly '/api/simulation/attempts': 'POST';
  readonly '/api/simulation/attempts/history': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/completion-report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/decisions': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/enter-room': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/evaluation': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/feedback': 'GET' | 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/hints': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/hints/next': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/interactions/{interaction_key}': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/npcs/{npc_key}': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/progress-map': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/reflections': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/resume': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/safe-exit': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/student-report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/tools/use': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/world': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/world-state': 'PATCH';
  readonly '/api/simulation/cases': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/active-attempt': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/brief': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/consent': 'DELETE' | 'GET' | 'POST';
  readonly '/api/simulation/catalog': 'GET';
}

export type OpenApiEndpointPath = keyof OpenApiPaths;
