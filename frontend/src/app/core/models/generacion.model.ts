/**
 * Los tipos de la API de generación de casos con IA (`/api/authoring/generations`), escritos a mano según el contrato final
 * de C1 (`docs/operacion/generacion-de-casos.md`). Cuando el contrato generado de OpenAPI los traiga, se cambian por ellos.
 */
import type { ValidationIssue } from './simulation.model';

export type GenerationStatusValue =
  | 'created' | 'skeleton_ready' | 'scenes_ready' | 'needs_repair' | 'imported' | 'failed' | 'cancelled';

export type GenerationSceneState = 'pending' | 'running' | 'done' | 'error';

/** Por qué falló una etapa: `refusal` es la negativa de la IA (`AI_REFUSED`); las demás vienen de `AI_PROVIDER_ERROR`. */
export type GenerationErrorKind = 'timeout' | 'http' | 'malformed' | 'refusal';

export interface GenerationError {
  kind: GenerationErrorKind;
  message: string;
}

export interface GenerationSkeletonScene {
  /** El id de la sala del lugar: es la clave de la escena. */
  clave: string;
  titulo: string;
  final: boolean;
}

export interface GenerationSkeleton {
  titulo: string;
  /** Las escenas en orden: la primera es la de inicio. */
  escenas: GenerationSkeletonScene[];
}

export interface GenerationScene {
  clave: string;
  titulo: string;
  /** Una escena en curso hace más de 150 s llega como `error` con `error.kind: 'timeout'`. */
  state: GenerationSceneState;
  error: GenerationError | null;
}

/** Mientras `status` es `needs_repair`: la ronda, las escenas que se vuelven a pedir y sus faltas. */
export interface GenerationRepair {
  round: 1 | 2;
  scenes: string[];
  issues: Record<string, ValidationIssue[]>;
}

export interface GenerationLastError extends GenerationError {
  stage: 'skeleton' | 'scene' | 'assemble';
  clave: string | null;
}

export interface Generation {
  id: string;
  lugarId: string;
  descripcion: string;
  status: GenerationStatusValue;
  /** `null` hasta que el esqueleto esté listo. */
  skeleton: GenerationSkeleton | null;
  scenes: GenerationScene[];
  /** Las rondas de reparación ya abiertas (0, 1 o 2). */
  repairRounds: number;
  repair: GenerationRepair | null;
  /**
   * `null` o `{stage, clave, kind, message}`; se borra cuando la misma etapa sale bien. Un esqueleto en curso hace más de 150 s
   * llega aquí como `stage: 'skeleton'`, `kind: 'timeout'`.
   */
  lastError: GenerationLastError | null;
  /** El borrador creado; solo con `status: "imported"`. */
  caseVersionId: number | null;
  /**
   * Solo se llena con `imported` (las faltas que quedan) y `failed` (las que impidieron importar), y solo trae faltas de
   * severidad `error`. En `needs_repair` va vacío: las faltas viajan en `repair.issues`.
   */
  issues: ValidationIssue[];
  /** Las llamadas a la IA gastadas y el tope por generación (vienen siempre). */
  callsUsed: number;
  callsLimit: number;
  /** UTC, `YYYY-MM-DDTHH:MM:SSZ`: si se muestra, en hora local con `Intl`. */
  createdAt: string;
  updatedAt: string;
}

export interface GenerationStatus {
  enabled: boolean;
  remainingToday: number;
  /** La generación en curso de la docente, o `null`. */
  inProgress: Generation | null;
}

export interface GenerationStartRequest {
  lugarId: string;
  descripcion: string;
}
