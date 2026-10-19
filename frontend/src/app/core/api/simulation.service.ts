import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { ApiResponse } from './api-response';
import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { resolveScenarioConfigAssetKey } from '../../features/simulator/scenario-config-assets.util';
import {
  AttemptCompletionReport,
  CaseBrief,
  CatalogItem,
  DecisionConsequence,
  DecisionRetry,
  HintState,
  InteractionResult,
  ScenarioConfig,
  SimulationAttemptState,
  SimulationCaseSummary,
  SimulationDecisionResult,
  StudentAttemptSummary,
  ProgressMapState,
  SimulationWorldState,
  ToolUseResult
} from '../models/simulation.model';

/**
 * La respuesta de una decisión (C2) llega en una de dos formas según `FEEDBACK_AT_CLOSE_ONLY`: el estado del intento
 * aplanado (bandera apagada) o `{ attempt, consequence, retry? }` (encendida). Ambas se llevan a una sola.
 */
type DecisionResponseWire =
  | (SimulationAttemptState & { consequence?: DecisionConsequence | null; retry?: DecisionRetry | null })
  | { attempt: SimulationAttemptState; consequence?: DecisionConsequence | null; retry?: DecisionRetry | null };

function normalizeDecisionResult(data: DecisionResponseWire): SimulationDecisionResult {
  const attempt = 'attempt' in data ? data.attempt : data;
  return { ...attempt, consequence: data.consequence ?? null, retry: data.retry ?? null };
}

/**
 * API del jugador: catálogo, intentos, mundo, interacciones, decisiones, pausa segura y
 * reportes del estudiante. Las operaciones de autoría están en `AuthoringApi` y las del
 * instructor en `InstructorApi` (Interface Segregation).
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/simulation';

  private attemptOptions(attemptToken: string) {
    return { headers: new HttpHeaders({ 'X-SIEP-Attempt-Token': attemptToken }) };
  }

  listCases() {
    return this.http.get<ApiResponse<SimulationCaseSummary[]>>(`${this.API}/cases`)
      .pipe(map(response => response.data));
  }

  getCatalog() {
    return this.http.get<ApiResponse<CatalogItem[]>>(`${this.API}/catalog`)
      .pipe(map(response => response.data));
  }

  /**
   * La ficha del caso (C8, RF-16): contexto, personajes y objetivos, sin crear intento. El 403 `ACCESS_NOT_ASSIGNED` lo
   * explica la pantalla con su propio texto, así que el aviso genérico de «sin permisos» no sale además.
   */
  getCaseBrief(caseVersionId: number) {
    return this.http.get<ApiResponse<CaseBrief>>(`${this.API}/cases/${caseVersionId}/brief`, {
      context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
    }).pipe(map(response => response.data));
  }

  /**
   * Inicia el intento o devuelve el abierto. El 403 `ACCESS_*` (cerró, aún no abre, secuencia) lo explica la pantalla de
   * juego con el aviso del caso, así que el aviso genérico de «sin permisos» no sale además.
   */
  startAttempt(caseVersionId: number, forceNew = false) {
    return this.http.post<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts`, { caseVersionId, forceNew }, {
      context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
    }).pipe(map(response => response.data));
  }

  getActiveAttempt(caseVersionId: number) {
    return this.http.get<ApiResponse<SimulationAttemptState>>(`${this.API}/cases/${caseVersionId}/active-attempt`, {
      observe: 'response'
    }).pipe(map(response => response.status === 204 ? null : response.body!.data));
  }

  /** Las pistas de la escena actual (C9): lo que el intento ya pidió y cuántas quedan. */
  getHints(attemptId: string, attemptToken: string) {
    return this.http.get<ApiResponse<HintState>>(`${this.API}/attempts/${attemptId}/hints`, this.attemptOptions(attemptToken))
      .pipe(map(response => response.data));
  }

  /** Pide la siguiente pista (C9, sin costo). `requestId` la hace idempotente: un doble clic revela una sola. */
  revealNextHint(attemptId: string, attemptToken: string, requestId: string) {
    return this.http.post<ApiResponse<HintState>>(`${this.API}/attempts/${attemptId}/hints/next`, { attemptToken, requestId })
      .pipe(map(response => response.data));
  }

  getProgressMap(attemptId: string, attemptToken: string) {
    return this.http.get<ApiResponse<ProgressMapState>>(
      `${this.API}/attempts/${attemptId}/progress-map`, this.attemptOptions(attemptToken),
    )
      .pipe(map(response => response.data));
  }

  getWorld(attemptId: string, attemptToken: string) {
    return this.http.get<ApiResponse<SimulationWorldState>>(
      `${this.API}/attempts/${attemptId}/world`, this.attemptOptions(attemptToken),
    )
      .pipe(map(response => response.data));
  }

  getScenarioConfig(mapOrScenarioKey: string) {
    const assetKey = resolveScenarioConfigAssetKey(mapOrScenarioKey);
    return this.http.get<ScenarioConfig>(`/assets/game/scenarios/${assetKey}.json`);
  }

  /** Fase 5: walk-through spatial door — load the target room (non-scored).
   *  doorKey es obligatorio; el backend deriva la entrada desde sus metadatos. */
  enterRoom(attemptId: string, attemptToken: string, targetNodeKey: string, doorKey: string) {
    return this.http.post<ApiResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/enter-room`, {
      attemptToken, targetNodeKey, doorKey,
    }).pipe(map(response => response.data));
  }

  updateWorldState(attemptId: string, attemptToken: string, playerX: number, playerY: number, currentMapKey: string) {
    return this.http.patch<ApiResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/world-state`, {
      attemptToken,
      playerX,
      playerY,
      currentMapKey
    }).pipe(map(response => response.data));
  }

  openInteraction(attemptId: string, attemptToken: string, interactionKey: string) {
    return this.http.post<ApiResponse<InteractionResult>>(`${this.API}/attempts/${attemptId}/interactions/${interactionKey}`, {
      attemptToken
    }).pipe(map(response => response.data));
  }

  useTool(attemptId: string, attemptToken: string, toolCode: string, targetInteractionKey: string | null) {
    return this.http.post<ApiResponse<ToolUseResult>>(`${this.API}/attempts/${attemptId}/tools/use`, {
      attemptToken,
      toolCode,
      targetInteractionKey
    }).pipe(map(response => response.data));
  }

  recordNpcInteraction(attemptId: string, attemptToken: string, npcKey: string) {
    return this.http.post<ApiResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/npcs/${encodeURIComponent(npcKey)}`, {
      attemptToken
    }).pipe(map(response => response.data));
  }

  /**
   * Registra una decisión (C2). `requestId` identifica la INTENCIÓN de elegir la opción: quien llama lo reutiliza si
   * reenvía la misma elección tras un fallo de red, y el servidor responde la repetición sin decidir dos veces.
   */
  chooseDecision(
    attemptId: string,
    attemptToken: string,
    decisionOptionId: number,
    evidenceOverride = false,
    missingEvidence: string[] = [],
    requestId?: string,
  ) {
    return this.http.post<ApiResponse<DecisionResponseWire>>(`${this.API}/attempts/${attemptId}/decisions`, {
      attemptToken,
      decisionOptionId,
      evidenceOverride,
      missingEvidence,
      ...(requestId ? { requestId } : {}),
    }).pipe(map(response => normalizeDecisionResult(response.data)));
  }

  saveReflection(attemptId: string, attemptToken: string, nodeId: number, text: string) {
    return this.http.post<ApiResponse<{ nodeId: number; locked: boolean }>>(`${this.API}/attempts/${attemptId}/reflections`, {
      attemptToken,
      nodeId,
      text
    }).pipe(map(response => response.data));
  }

  safeExit(attemptId: string, attemptToken: string, reason: string) {
    return this.http.post<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}/safe-exit`, {
      attemptToken,
      reason
    }).pipe(map(response => response.data));
  }

  /** Reanuda un intento en pausa segura (mismo attemptId, estado intacto). */
  resumeAttempt(attemptId: string, attemptToken: string) {
    return this.http.post<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}/resume`, {
      attemptToken
    }).pipe(map(response => response.data));
  }

  attemptHistory() {
    return this.http.get<ApiResponse<StudentAttemptSummary[]>>(`${this.API}/attempts/history`)
      .pipe(map(response => response.data));
  }

  studentReport(attemptId: string) {
    // El backend Django no envía phaseDurations (era un campo de la API Spring).
    return this.http.get<ApiResponse<AttemptCompletionReport>>(`${this.API}/attempts/${attemptId}/student-report`)
      .pipe(map(response => ({ ...response.data, phaseDurations: response.data.phaseDurations ?? [] })));
  }
}
