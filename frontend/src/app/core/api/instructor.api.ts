import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { AttemptTrace, RecentAttempt, RubricEvaluationView } from '../models/simulation.model';
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

  attemptTrace(attemptId: string) {
    return this.http.get<ApiResponse<AttemptTrace>>(`/api/instructor/attempts/${attemptId}/trace`)
      .pipe(map(response => response.data));
  }

  rubric(attemptId: string) {
    return this.http.get<ApiResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation/`)
      .pipe(map(response => response.data));
  }

  saveRubric(attemptId: string, rubricId: number, comment: string, scores: { criterionId: number; score: number; comment: string }[]) {
    return this.http.put<ApiResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation/`, {
      rubricId,
      comment,
      scores
    }).pipe(map(response => response.data));
  }
}
