import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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

  /** Guarda la valoración del docente: un nivel formativo por criterio (la rúbrica no lleva números). */
  saveRubric(attemptId: string, rubricId: number, comment: string, scores: { criterionId: number; level: FormativeLevel; comment: string }[]) {
    return this.http.put<ApiResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation`, {
      rubricId,
      comment,
      scores
    }).pipe(map(response => response.data));
  }
}
