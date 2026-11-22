import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';

/** Respuesta del reemplazo docente (E1-2). */
export interface ReplacedAttempt {
  attemptId: string;
  status: string;
  reason: string;
  replacedAt: string | null;
}
import {
  AttemptTrace,
  FormativeLevel,
  InstructorAttemptsPage,
  InstructorAttemptsQuery,
  RecentAttempt,
  RubricEvaluationView,
} from '../models/simulation.model';
import { ApiResponse } from './api-response';

/**
 * API del instructor: trazas de intentos y evaluación con rúbrica.
 * Separada de `SimulationService` (Interface Segregation) para que quien solo
 * revisa intentos no dependa de los métodos del jugador ni de los de autoría.
 */
@Injectable({ providedIn: 'root' })
export class InstructorApi {
  private readonly http = inject(HttpClient);

  recentAttempts() {
    return this.http.get<ApiResponse<RecentAttempt[]>>('/api/instructor/attempts/recent')
      .pipe(map(response => response.data));
  }

  /**
   * La revisión docente paginada y filtrable (`GET /api/instructor/attempts`, E5-6). BK-3: `evaluacion: 'pendiente'` trae
   * la bandeja «Por revisar» (terminados sin valoración concluida) y cada fila dice su `evaluationStatus`. Un filtro
   * ausente (o vacío) no viaja: el servidor responde 400 a un valor que no conoce, nunca «sin resultados».
   */
  listAttempts(query: InstructorAttemptsQuery = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query) as [string, string | number | undefined][]) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ApiResponse<InstructorAttemptsPage>>('/api/instructor/attempts', { params })
      .pipe(map(response => response.data));
  }

  attemptTrace(attemptId: string) {
    return this.http.get<ApiResponse<AttemptTrace>>(`/api/instructor/attempts/${attemptId}/trace`)
      .pipe(map(response => response.data));
  }

  rubric(attemptId: string) {
    return this.http.get<ApiResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation`)
      .pipe(map(response => response.data));
  }

  /** E1-2 (RN-07): el docente reemplaza un intento ABIERTO con un motivo (queda en el intento y en la auditoría). */
  replaceAttempt(attemptId: string, reason: string) {
    return this.http.post<ApiResponse<ReplacedAttempt>>(`/api/instructor/attempts/${attemptId}/replace`, { reason })
      .pipe(map(response => response.data));
  }

  /**
   * Guarda la valoración del docente: un nivel formativo por criterio (la rúbrica no lleva números).
   *
   * RK-5 (bloque R0) · `opciones.deliver: false` es «Guardar sin entregar»: queda pendiente aunque esté completa y el
   * estudiante no la ve. Solo vale antes de la primera entrega: sobre una ya entregada el servidor responde 409
   * `EVALUATION_ALREADY_DELIVERED` y no cambia nada (ver `esValoracionYaEntregada`). Sin `opciones` el cuerpo es
   * exactamente el de siempre y la valoración completa se entrega, como hoy.
   */
  saveRubric(
    attemptId: string,
    rubricId: number,
    comment: string,
    scores: { criterionId: number; level: FormativeLevel; comment: string }[],
    opciones: { deliver?: boolean } = {},
  ) {
    return this.http.put<ApiResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation`, {
      rubricId,
      comment,
      scores,
      // Solo viaja si alguien lo pidió: un servidor anterior a R0 recibe el cuerpo de siempre.
      ...(opciones.deliver === undefined ? {} : { deliver: opciones.deliver }),
    }).pipe(map(response => response.data));
  }
}

/** RK-5 · El código con que el servidor rechaza «Guardar sin entregar» sobre una valoración que el estudiante ya ve. */
export const EVALUATION_ALREADY_DELIVERED = 'EVALUATION_ALREADY_DELIVERED';

/**
 * RK-5 · ¿Es este error el 409 de una valoración ya entregada? La pantalla lo usa para decir «ya la entregaste» y
 * esconder «Guardar sin entregar», en vez del mensaje genérico. Se decide por el `code` del sobre de error
 * (`{ success: false, code, message }`), nunca por el texto, como `isConsentRequiredError`.
 */
export function esValoracionYaEntregada(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) return false;
  const body = error.error as { code?: unknown } | null;
  return body?.code === EVALUATION_ALREADY_DELIVERED;
}
