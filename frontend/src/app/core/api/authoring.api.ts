import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, tap } from 'rxjs/operators';
import {
  CaseEditorView,
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

/**
 * API de autoría: editor de casos (nodos, decisiones, mapas, objetos, herramientas,
 * checklist), publicación y editor de mundo. Separada de `SimulationService`
 * (Interface Segregation): el jugador no necesita ninguno de estos métodos, y sus
 * únicos consumidores son el editor de casos, el hub de autoría, el store del editor
 * de mundo y la vista previa.
 */
@Injectable({ providedIn: 'root' })
export class AuthoringApi {
  private readonly http = inject(HttpClient);
  private readonly caseList = inject(CaseListCache);

  caseEditor(caseVersionId: number) {
    return this.http.get<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/editor`)
      .pipe(map(response => response.data));
  }

  publishCase(caseVersionId: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/publish`, {})
      .pipe(
        map(response => response.data),
        // Publicar agrega un caso a la lista de publicados: la lista guardada ya no sirve.
        tap(() => this.caseList.invalidate()),
      );
  }

  cloneCaseVersion(caseVersionId: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/clone-version`, {})
      .pipe(map(response => response.data));
  }

  listAuthoringCases() {
    return this.http.get<ApiResponse<SimulationCaseSummary[]>>('/api/admin/cases')
      .pipe(map(response => response.data));
  }

  createCase(body: CaseCreateRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>('/api/admin/cases', body)
      .pipe(map(response => response.data));
  }

  // ─── Node CRUD ──────────────────────────────────────────────────────────────

  createNode(caseVersionId: number, body: NodeUpsertRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/nodes`, body)
      .pipe(map(r => r.data));
  }

  updateNode(caseVersionId: number, nodeId: number, body: NodeUpsertRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/nodes/${nodeId}`, body)
      .pipe(map(r => r.data));
  }

  deleteNode(caseVersionId: number, nodeId: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/nodes/${nodeId}`)
      .pipe(map(r => r.data));
  }

  // ─── Decision CRUD ──────────────────────────────────────────────────────────

  createDecision(caseVersionId: number, body: DecisionOptionUpsertRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/decisions`, body)
      .pipe(map(r => r.data));
  }

  updateDecision(caseVersionId: number, decisionId: number, body: DecisionOptionUpsertRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/decisions/${decisionId}`, body)
      .pipe(map(r => r.data));
  }

  deleteDecision(caseVersionId: number, decisionId: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/decisions/${decisionId}`)
      .pipe(map(r => r.data));
  }

  // ─── Map CRUD ───────────────────────────────────────────────────────────────

  createMap(caseVersionId: number, body: MapUpsertRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/maps`, body)
      .pipe(map(r => r.data));
  }

  updateMap(caseVersionId: number, mapId: number, body: MapUpsertRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/maps/${mapId}`, body)
      .pipe(map(r => r.data));
  }

  deleteMap(caseVersionId: number, mapId: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/maps/${mapId}`)
      .pipe(map(r => r.data));
  }

  // ─── Map Object CRUD ────────────────────────────────────────────────────────

  createObject(caseVersionId: number, mapId: number, body: MapObjectUpsertRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/maps/${mapId}/objects`, body)
      .pipe(map(r => r.data));
  }

  updateObject(caseVersionId: number, objectId: number, body: MapObjectUpsertRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/objects/${objectId}`, body)
      .pipe(map(r => r.data));
  }

  deleteObject(caseVersionId: number, objectId: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/objects/${objectId}`)
      .pipe(map(r => r.data));
  }

  // ─── Tool CRUD ──────────────────────────────────────────────────────────────

  createTool(caseVersionId: number, body: ToolUpsertRequest) {
    return this.http.post<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/tools`, body)
      .pipe(map(r => r.data));
  }

  updateTool(caseVersionId: number, toolId: number, body: ToolUpsertRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/tools/${toolId}`, body)
      .pipe(map(r => r.data));
  }

  deleteTool(caseVersionId: number, toolId: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/tools/${toolId}`)
      .pipe(map(r => r.data));
  }

  // ─── Checklist ──────────────────────────────────────────────────────────────

  updateChecklist(caseVersionId: number, body: ChecklistUpdateRequest) {
    return this.http.put<ApiResponse<CaseEditorView>>(`/api/admin/cases/${caseVersionId}/checklist`, body)
      .pipe(map(r => r.data));
  }

  // ─── WorldDefinition v2 (Fase 2) ──────────────────────────────────────────

  /** Carga el WorldDefinition completo de un nodo/mapa para el editor Konva. */
  worldEditor(caseVersionId: number, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.get<ApiResponse<WorldDefinition>>(
      `/api/admin/cases/${caseVersionId}/world-editor`, { params })
      .pipe(map(r => r.data));
  }

  /** Guarda el borrador del mundo (con bloqueo optimista por revision). */
  saveWorld(caseVersionId: number, body: WorldSaveRequest, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.put<ApiResponse<WorldDefinition>>(
      `/api/admin/cases/${caseVersionId}/world`, body, { params })
      .pipe(map(r => r.data));
  }

  /** Ejecuta validacion del mundo sin mutar datos. */
  validateWorld(caseVersionId: number) {
    return this.http.post<ApiResponse<WorldValidationState>>(
      `/api/admin/cases/${caseVersionId}/world/validate`, {})
      .pipe(map(r => r.data));
  }

  /** Preview efimero del mundo DRAFT (sin crear attempt). */
  worldPreview(caseVersionId: number, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.get<ApiResponse<WorldDefinition>>(
      `/api/admin/cases/${caseVersionId}/world-preview`, { params })
      .pipe(map(r => r.data));
  }
}
