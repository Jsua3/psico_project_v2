import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, tap } from 'rxjs/operators';
import {
  CaseEditorView,
  CaseLifecycle,
  CaseTransitionRequest,
  CaseValidation,
  ChecklistUpdateRequest,
  DecisionOptionUpsertRequest,
  MapObjectUpsertRequest,
  MapUpsertRequest,
  NodeUpsertRequest,
  SimulationCaseSummary,
  ToolUpsertRequest,
  WorldDefinition,
  WorldSaveRequest,
  WorldValidationState
} from '../models/simulation.model';
import { ApiResponse } from './api-response';
import { CaseListCache } from './case-list-cache';

export interface CaseCreateRequest {
  title: string;
  code?: string | null;
  description?: string | null;
}

/** Cabecera con la revisión que el editor tiene del caso (E2-6): el servidor responde 409 si está vencida. */
export const CASE_REVISION_HEADER = 'X-Case-Revision';

/** Opciones de petición con la revisión vigente; sin revisión no hay cabecera y el servidor no compara. */
const withRevision = (revision?: number | null) =>
  revision == null ? {} : { headers: { [CASE_REVISION_HEADER]: String(revision) } };

/**
 * API de autoría: editor de casos (nodos, decisiones, mapas, objetos, herramientas,
 * checklist), publicación y editor de mundo. Separada de `SimulationService`
 * (Interface Segregation): el jugador no necesita ninguno de estos métodos, y sus
 * únicos consumidores son el editor de casos, el hub de autoría, el store del editor
 * de mundo y la vista previa.
 *
 * Toda mutación del borrador acepta la `revision` que el editor tiene (la de la última vista que recibió): viaja
 * en `X-Case-Revision` y cada respuesta trae la vista nueva con la revisión siguiente (E2-6, RNF-08).
 */
@Injectable({ providedIn: 'root' })
export class AuthoringApi {
  private readonly http = inject(HttpClient);
  private readonly caseList = inject(CaseListCache);
  /** Espacio canónico de la autoría (ED-9); la ruta antigua bajo admin/cases sigue en el servidor como alias. */
  private readonly API = '/api/authoring/cases';

  caseEditor(caseVersionId: number) {
    return this.http.get<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/editor`)
      .pipe(map(response => response.data));
  }

  publishCase(caseVersionId: number, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/publish`, {}, withRevision(revision))
      .pipe(
        map(response => response.data),
        // Publicar agrega un caso a la lista de publicados: la lista guardada ya no sirve.
        tap(() => this.caseList.invalidate()),
      );
  }

  cloneCaseVersion(caseVersionId: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/clone-version`, {})
      .pipe(map(response => response.data));
  }

  listAuthoringCases() {
    return this.http.get<ApiResponse<SimulationCaseSummary[]>>(this.API)
      .pipe(map(response => response.data));
  }

  createCase(body: CaseCreateRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(this.API, body)
      .pipe(map(response => response.data));
  }

  // ─── Node CRUD ──────────────────────────────────────────────────────────

  createNode(caseVersionId: number, body: NodeUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/nodes`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateNode(caseVersionId: number, nodeId: number, body: NodeUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/nodes/${nodeId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteNode(caseVersionId: number, nodeId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/nodes/${nodeId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Decision CRUD ─────────────────────────────────────────────────────────

  createDecision(caseVersionId: number, body: DecisionOptionUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/decisions`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateDecision(caseVersionId: number, decisionId: number, body: DecisionOptionUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/decisions/${decisionId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Map CRUD ──────────────────────────────────────────────────────────

  createMap(caseVersionId: number, body: MapUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateMap(caseVersionId: number, mapId: number, body: MapUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps/${mapId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteMap(caseVersionId: number, mapId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps/${mapId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Map Object CRUD ────────────────────────────────────────────────────────

  createObject(caseVersionId: number, mapId: number, body: MapObjectUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps/${mapId}/objects`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateObject(caseVersionId: number, objectId: number, body: MapObjectUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/objects/${objectId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteObject(caseVersionId: number, objectId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/objects/${objectId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Tool CRUD ──────────────────────────────────────────────────────────

  createTool(caseVersionId: number, body: ToolUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/tools`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateTool(caseVersionId: number, toolId: number, body: ToolUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/tools/${toolId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteTool(caseVersionId: number, toolId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/tools/${toolId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Checklist ──────────────────────────────────────────────────────────

  updateChecklist(caseVersionId: number, body: ChecklistUpdateRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/checklist`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── WorldDefinition v2 (Fase 2) ──────────────────────────────────────────

  /** Carga el WorldDefinition completo de un nodo/mapa para el editor Konva. */
  worldEditor(caseVersionId: number, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.get<ApiResponse<WorldDefinition>>(
      `${this.API}/${caseVersionId}/world-editor`, { params })
      .pipe(map(r => r.data));
  }

  /** Guarda el borrador del mundo (con bloqueo optimista por revision). */
  saveWorld(caseVersionId: number, body: WorldSaveRequest, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.put<ApiResponse<WorldDefinition>>(
      `${this.API}/${caseVersionId}/world`, body, { params })
      .pipe(map(r => r.data));
  }

  /** Ejecuta validacion del mundo sin mutar datos. */
  validateWorld(caseVersionId: number) {
    return this.http.post<ApiResponse<WorldValidationState>>(
      `${this.API}/${caseVersionId}/world/validate`, {})
      .pipe(map(r => r.data));
  }

  /** C6: la validación del caso con hallazgos en lenguaje llano y a qué escena o mapa llevar al autor. */
  validateCase(caseVersionId: number) {
    return this.http.post<ApiResponse<CaseValidation>>(`${this.API}/${caseVersionId}/validate`, {})
      .pipe(map(response => response.data));
  }

  /** C4: el estado de la versión, las transiciones que quien llama puede hacer y la última revisión. */
  lifecycle(caseVersionId: number) {
    return this.http.get<ApiResponse<CaseLifecycle>>(`${this.API}/${caseVersionId}/lifecycle`)
      .pipe(map(response => response.data));
  }

  /** C4: enviar a revisión, aprobar, devolver o archivar; devuelve el ciclo resultante (el de la copia si es clonar). */
  transitionCase(caseVersionId: number, request: CaseTransitionRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseLifecycle>>(`${this.API}/${caseVersionId}/lifecycle`, request, withRevision(revision))
      .pipe(
        map(response => response.data),
        // Aprobar o archivar cambia qué casos ven los estudiantes: la lista guardada ya no sirve.
        tap(() => this.caseList.invalidate()),
      );
  }

  /** Preview efimero del mundo DRAFT (sin crear attempt). */
  worldPreview(caseVersionId: number, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.get<ApiResponse<WorldDefinition>>(
      `${this.API}/${caseVersionId}/world-preview`, { params })
      .pipe(map(r => r.data));
  }
}
