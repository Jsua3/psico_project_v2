import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { ApiResponse } from './api-response';
import { SCREEN_HANDLES_FORBIDDEN, SCREEN_HANDLES_OFFLINE } from '../auth/http-error-chain';
import { resolveScenarioConfigAssetKey } from '../../features/simulator/scenario-config-assets.util';
import type { ConsentRecordEnvelope, ConsentStateEnvelope, ConsentWithdrawalEnvelope } from './generated/openapi-contracts';
import {
  AttemptCompletionReport,
  CaseBrief,
  CatalogItem,
  DecisionConsequence,
  DecisionReaction,
  DecisionRetry,
  HintState,
  InteractionResult,
  OwnerEvaluation,
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
 * La respuesta de una decisión (C2) tiene una sola forma: `{ attempt, consequence, retry? }`. Sin puntaje, delta ni
 * clase: tras decidir solo llegan la consecuencia y, si el caso concede otra oportunidad, el reintento.
 */
interface PositionAck {
  attemptId: string;
  status: SimulationAttemptState['status'];
  map: { key: string };
  player: { x: number; y: number };
}

interface DecisionResponseWire {
  attempt: SimulationAttemptState;
  consequence: DecisionConsequence | null;
  retry?: DecisionRetry | null;
  reaction?: DecisionReaction | null;
}

function toDecisionResult(data: DecisionResponseWire): SimulationDecisionResult {
  return { ...data.attempt, consequence: data.consequence, retry: data.retry ?? null, reaction: data.reaction ?? null };
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

  /** El intento tal como está ahora (contrato 2.1, §4.1); lo usa el ensayo para retomar el estado. */
  getAttempt(attemptId: string, attemptToken: string) {
    return this.http.get<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}`, this.attemptOptions(attemptToken))
      .pipe(map(response => response.data));
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
  startAttempt(caseVersionId: number, forceNew = false, expectedAttemptId?: string) {
    // `expectedAttemptId` (solo con forceNew): el intento que la persona aceptó perder. El servidor lo compara bajo cerrojo
    // y responde 409 ATTEMPT_CHANGED si el abierto ya es otro, así una carrera nunca reemplaza un intento no aceptado.
    const cuerpo = forceNew && expectedAttemptId ? { caseVersionId, forceNew, expectedAttemptId } : { caseVersionId, forceNew };
    return this.http.post<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts`, cuerpo, {
      context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
    }).pipe(map(response => response.data));
  }

  getActiveAttempt(caseVersionId: number) {
    return this.http.get<ApiResponse<SimulationAttemptState>>(`${this.API}/cases/${caseVersionId}/active-attempt`, {
      observe: 'response'
    }).pipe(map(response => response.status === 204 ? null : response.body!.data));
  }

  /**
   * El consentimiento de la persona al aviso de contenido de esta versión del caso (C12, ETH-01): la versión VIGENTE del
   * aviso, si el servidor exige el consentimiento y si ya lo aceptó. Los tipos salen del esquema OpenAPI generado.
   */
  getConsent(caseVersionId: number) {
    return this.http.get<ConsentStateEnvelope>(`${this.API}/cases/${caseVersionId}/consent`)
      .pipe(map(response => response.data));
  }

  /**
   * Registra la aceptación del aviso (201 si es nueva, 200 si ya existía). `noticeVersion` es la versión que el cliente
   * mostró: si no es la vigente, 409 `NOTICE_VERSION_STALE`. No lleva el token de intento: es del caso, no del intento.
   */
  acceptConsent(caseVersionId: number, noticeVersion: string) {
    return this.http.post<ConsentRecordEnvelope>(`${this.API}/cases/${caseVersionId}/consent`, { noticeVersion })
      .pipe(map(response => response.data));
  }

  /** Retira el consentimiento (idempotente): impide seguir jugando ese caso y no borra lo hecho. */
  withdrawConsent(caseVersionId: number) {
    return this.http.delete<ConsentWithdrawalEnvelope>(`${this.API}/cases/${caseVersionId}/consent`)
      .pipe(map(response => response.data));
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

  /** `screenHandlesOffline`: la posición que viaja con la pausa (V4); sin red la explica la pantalla de pausa, no el aviso global. */
  updateWorldState(attemptId: string, attemptToken: string, playerX: number, playerY: number, currentMapKey: string, screenHandlesOffline = false) {
    return this.http.patch<ApiResponse<PositionAck>>(`${this.API}/attempts/${attemptId}/world-state`, {
      attemptToken,
      playerX,
      playerY,
      currentMapKey
    }, screenHandlesOffline ? { context: new HttpContext().set(SCREEN_HANDLES_OFFLINE, true) } : {}).pipe(map(response => response.data));
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
    }).pipe(map(response => toDecisionResult(response.data)));
  }

  saveReflection(attemptId: string, attemptToken: string, nodeId: number, text: string) {
    return this.http.post<ApiResponse<{ nodeId: number; locked: boolean }>>(`${this.API}/attempts/${attemptId}/reflections`, {
      attemptToken,
      nodeId,
      text
    }).pipe(map(response => response.data));
  }

  safeExit(attemptId: string, attemptToken: string, reason: string) {
    // Sin red, la pantalla de pausa ya lo dice (REGLA-004, V3): el aviso global de conexión no le tapa el título.
    return this.http.post<ApiResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}/safe-exit`, {
      attemptToken,
      reason
    }, { context: new HttpContext().set(SCREEN_HANDLES_OFFLINE, true) }).pipe(map(response => response.data));
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

  /**
   * BK-5 · La retroalimentación del docente tal como la lee el dueño del intento (`GET …/attempts/{id}/evaluation`): solo
   * las valoraciones concluidas, con niveles en palabras y sin números. Otro estudiante recibe 403 y la pantalla del cierre
   * lo explica en su sección, así que el aviso genérico de «sin permisos» no sale además.
   */
  getOwnerEvaluation(attemptId: string) {
    return this.http.get<ApiResponse<OwnerEvaluation>>(`${this.API}/attempts/${attemptId}/evaluation`, {
      context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
    }).pipe(map(response => response.data));
  }

  studentReport(attemptId: string) {
    // El backend Django no envía phaseDurations (era un campo de la API Spring).
    return this.http.get<ApiResponse<AttemptCompletionReport>>(`${this.API}/attempts/${attemptId}/student-report`)
      .pipe(map(response => ({ ...response.data, phaseDurations: response.data.phaseDurations ?? [] })));
  }
}
