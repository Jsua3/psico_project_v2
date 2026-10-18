// ARCHIVO GENERADO AUTOMÁTICAMENTE DESDE EL CONTRATO OPENAPI (E5-9 · DJG-6).
// No editar a mano: regenerar con `node scripts/openapi/generate-types.mjs`.

/** Sobre de éxito de la API: `{success, message?, data?}` (`shared.response.envelope`). `message` y `data` solo viajan cuando tienen valor. Los endpoints que aún no se tipan llevan este sobre con `data` sin forma. */
export interface ApiEnvelope {
  readonly data?: unknown;
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

export type CaseVersionStatusEnum = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

/** Sobre de error de la API: `{success: false, code, message, field?}` (`shared.exceptions`). `code` es estable: el cliente decide por él, nunca por el texto. Algunos errores de dominio suman campos propios en la raíz (`existingAttemptId`, `nodeId`…). */
export interface ErrorEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** Un intento en la revisión docente. El estudiante se identifica solo por su alias (nunca por su id). */
export interface InstructorAttemptItem {
  readonly accumulatedScore: number;
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
  readonly stressIndex: number;
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

/** Cuántos resultados trae la página (`shown`) y cuántos hay en total (`total`). */
export interface PageCoverage {
  readonly shown: number;
  readonly total: number;
}

/** Posición del jugador en el mapa, en píxeles. */
export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
}

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
  readonly '/api/admin/users/{user_id}/status': 'PATCH';
  readonly '/api/assignments': 'GET' | 'POST';
  readonly '/api/assignments/{assignment_id}': 'DELETE' | 'PATCH';
  readonly '/api/auth/access-request': 'POST';
  readonly '/api/auth/change-password': 'POST';
  readonly '/api/auth/google': 'POST';
  readonly '/api/auth/google/config': 'GET';
  readonly '/api/auth/login': 'POST';
  readonly '/api/auth/me': 'GET';
  readonly '/api/auth/register': 'POST';
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
  readonly '/api/instructor/attempts': 'GET';
  readonly '/api/instructor/attempts/recent': 'GET';
  readonly '/api/instructor/attempts/{attempt_id}/replace': 'POST';
  readonly '/api/instructor/attempts/{attempt_id}/rubric-evaluation': 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly '/api/instructor/attempts/{attempt_id}/trace': 'GET';
  readonly '/api/me/invitations': 'GET';
  readonly '/api/me/invitations/{group_id}/accept': 'POST';
  readonly '/api/me/invitations/{group_id}/decline': 'POST';
  readonly '/api/me/invitations/{group_id}/leave': 'POST';
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
  readonly '/api/simulation/ai-assistant': 'POST';
  readonly '/api/simulation/attempts': 'POST';
  readonly '/api/simulation/attempts/history': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/completion-report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/decisions': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/enter-room': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/evaluation': 'GET';
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
  readonly '/api/simulation/catalog': 'GET';
}

export type OpenApiEndpointPath = keyof OpenApiPaths;
