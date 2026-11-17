import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Escenario, LugarResumen } from '../models/biblioteca.model';
import {
  BriefUpdateRequest,
  CaseEditorView,
  CaseLifecycle,
  CaseTransitionRequest,
  CaseValidation,
  CharacterUpsertRequest,
  ChecklistUpdateRequest,
  DecisionOptionUpsertRequest,
  DialogueUpsertRequest,
  EndingRule,
  HintUpsertRequest,
  MapObjectUpsertRequest,
  MapUpsertRequest,
  Milestone,
  NodeUpsertRequest,
  RiskLevel,
  SimulationCaseSummary,
  ToolUpsertRequest,
  WorldDefinition,
  WorldDialoguesSaveRequest,
  WorldRoomSaveRequest,
  WorldValidationState
} from '../models/simulation.model';
import type {
  Generation,
  GenerationStartRequest,
  GenerationStatus,
} from '../models/generacion.model';
import { ApiResponse } from './api-response';
import type { AssistantGuide, AssistantGuideBody, AssistantProposeBody, AssistantResult, AssistantStatus } from './generated/openapi-contracts';
import { CaseListCache } from './case-list-cache';
import { revisionConflictOf } from './revision-conflict.util';

export interface CaseCreateRequest {
  title: string;
  code?: string | null;
  description?: string | null;
  /** Un lugar de la biblioteca: el caso nace con una copia de las salas elegidas (sin lugar, nace vacío como siempre). */
  lugarId?: string | null;
  /** Ids de las salas del lugar, en el orden pedido (la primera es el inicio); obligatoria con `lugarId`. */
  salas?: string[];
}

/** Cabecera con la revisión que el editor tiene del caso (E2-6): el servidor responde 409 si está vencida. */
export const CASE_REVISION_HEADER = 'X-Case-Revision';

/** Un 409 que dice que el caso ya no es el que se veía: otra sesión lo editó (`REVISION_CONFLICT`) o cambió su estado. */
function isStaleCase(err: unknown): boolean {
  if (revisionConflictOf(err)) return true;
  return err instanceof HttpErrorResponse && err.status === 409
    && (err.error as { code?: unknown } | null)?.code === 'INVALID_TRANSITION';
}

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
  private readonly caseChanged = new Subject<number>();
  /**
   * El id de una versión cuyo caso cambió bajo quien lo muestra: una transición aplicada (enviar, aprobar, devolver,
   * archivar) o un 409 que dice que su estado o su revisión ya no son los que se veían. Quien tiene abierto ese caso lo
   * relee. Vive aquí y no en una salida del panel de revisión porque ese panel está en una pestaña, y una pestaña
   * inactiva se destruye con la petición en vuelo (el servidor ya la recibió).
   */
  readonly caseChanges = this.caseChanged.asObservable();
  /** Espacio canónico de la autoría (ED-9); la ruta antigua bajo admin/cases sigue en el servidor como alias. */
  private readonly API = '/api/authoring/cases';
  /** La generación de casos con IA por etapas (C1). */
  private readonly API_GENERACION = '/api/authoring/generations';
  /** La biblioteca de lugares: de ahí sale lo que el editor ofrece al crear un caso y al agregar piezas. */
  private readonly API_LUGARES = '/api/biblioteca/lugares';

  caseEditor(caseVersionId: number) {
    return this.http.get<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/editor`)
      .pipe(map(response => response.data));
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

  deleteDecision(caseVersionId: number, decisionId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/decisions/${decisionId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Diálogos: uno por sala, con sus líneas ──────────────────────────────

  createDialogue(caseVersionId: number, mapId: number, body: DialogueUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps/${mapId}/dialogues`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** Las líneas que lleguen reemplazan a las que había; una línea sin `aiSuggested` conserva la marca de su lugar. */
  updateDialogue(caseVersionId: number, treeId: number, body: DialogueUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/dialogues/${treeId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteDialogue(caseVersionId: number, treeId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/dialogues/${treeId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Lo que propuso la IA: «Revisar» baja la marca de la parte (P5) ───────────

  acceptAiNode(caseVersionId: number, nodeId: number, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/nodes/${nodeId}/accept-ai`, {}, withRevision(revision))
      .pipe(map(r => r.data));
  }

  acceptAiDecision(caseVersionId: number, decisionId: number, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/decisions/${decisionId}/accept-ai`, {}, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** Baja la marca de TODAS las líneas del diálogo. */
  acceptAiDialogue(caseVersionId: number, treeId: number, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/dialogues/${treeId}/accept-ai`, {}, withRevision(revision))
      .pipe(map(r => r.data));
  }

  acceptAiObject(caseVersionId: number, objectId: number, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/objects/${objectId}/accept-ai`, {}, withRevision(revision))
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

  // ─── Reglas del modelo: hitos, nivel de riesgo y finales (modelo de métricas) ─────────

  /** Reemplaza la lista completa de hitos del caso; el servidor valida cada uno y nombra el campo que falla. */
  updateMilestones(caseVersionId: number, milestones: Milestone[], revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/rules/milestones`, { milestones }, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** Fija el nivel de riesgo del caso; `null` lo borra. */
  updateRisk(caseVersionId: number, riskLevel: RiskLevel | null, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/rules/risk`, { riskLevel }, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** Reemplaza la lista completa de finales, en el orden en que se evalúan. */
  updateEndings(caseVersionId: number, endings: EndingRule[], revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/rules/endings`, { endings }, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Ayudas, personajes, ficha y orden de las escenas (E3-3 a E3-6) ─────────

  createHint(caseVersionId: number, mapId: number, body: HintUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/maps/${mapId}/hints`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateHint(caseVersionId: number, hintId: number, body: HintUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/hints/${hintId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteHint(caseVersionId: number, hintId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/hints/${hintId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  createCharacter(caseVersionId: number, body: CharacterUpsertRequest, revision?: number) {
    return this.http.post<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/characters`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  updateCharacter(caseVersionId: number, characterId: number, body: CharacterUpsertRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/characters/${characterId}`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  deleteCharacter(caseVersionId: number, characterId: number, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/characters/${characterId}`, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** El contexto y los objetivos de la ficha del caso. */
  updateBrief(caseVersionId: number, body: BriefUpdateRequest, revision?: number) {
    return this.http.put<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/brief`, body, withRevision(revision))
      .pipe(map(r => r.data));
  }

  /** El orden de las escenas: los ids de TODAS, en el orden pedido (el servidor lo guarda como su posición). */
  reorderNodes(caseVersionId: number, order: number[], revision?: number) {
    return this.http.patch<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/nodes/reorder`, { order }, withRevision(revision))
      .pipe(map(r => r.data));
  }

  // ─── Asistente de IA de autoría (P5) ────────────────────────────────────────
  // El servidor no compara la revisión aquí: proponer NO escribe nada, el cliente aplica los cambios con las rutas de
  // siempre (y esas sí llevan la revisión). Apagado, las tres rutas son un 404.

  /** Si el asistente está listo y cuánto cupo le queda hoy a quien lo usa. */
  assistantStatus(caseVersionId: number) {
    return this.http.get<ApiResponse<AssistantStatus>>(`${this.API}/${caseVersionId}/assistant/status`)
      .pipe(map(r => r.data));
  }

  /** Una propuesta de cambios para la pantalla del editor; los `cambios` ya vienen validados contra el caso. */
  assistantPropose(caseVersionId: number, body: AssistantProposeBody) {
    return this.http.post<ApiResponse<AssistantResult>>(`${this.API}/${caseVersionId}/assistant/propose`, body)
      .pipe(map(r => r.data));
  }

  /** La guía («¿cómo hago X?»): elige una acción del catálogo que se le manda. */
  assistantGuide(caseVersionId: number, body: AssistantGuideBody) {
    return this.http.post<ApiResponse<AssistantGuide>>(`${this.API}/${caseVersionId}/assistant/guide`, body)
      .pipe(map(r => r.data));
  }

  // ─── Generación de casos con IA, por etapas (C1) ─────────────────────────────
  // Cada etapa devuelve la `Generation` completa. Apagada, todas menos `generationStatus` son un 404.

  /** Si la generación está disponible, cuánto cupo le queda hoy a la docente y la que tiene en curso. */
  generationStatus() {
    return this.http.get<ApiResponse<GenerationStatus>>(`${this.API_GENERACION}/status`)
      .pipe(map(r => r.data));
  }

  /** Abre una generación (`created`); 409 `GENERATION_IN_PROGRESS` si la docente ya tiene una en curso. */
  startGeneration(body: GenerationStartRequest) {
    return this.http.post<ApiResponse<Generation>>(this.API_GENERACION, body)
      .pipe(map(r => r.data));
  }

  generation(id: string) {
    return this.http.get<ApiResponse<Generation>>(`${this.API_GENERACION}/${encodeURIComponent(id)}`)
      .pipe(map(r => r.data));
  }

  /** Pide el esqueleto (las escenas del caso). */
  generationSkeleton(id: string) {
    return this.http.post<ApiResponse<Generation>>(`${this.API_GENERACION}/${encodeURIComponent(id)}/skeleton`, {})
      .pipe(map(r => r.data));
  }

  /** Pide una escena por su clave; con `repair` la vuelve a pedir en una ronda de reparación. */
  generationScene(id: string, clave: string, repair = false) {
    return this.http.post<ApiResponse<Generation>>(
      `${this.API_GENERACION}/${encodeURIComponent(id)}/scenes/${encodeURIComponent(clave)}`, {},
      repair ? { params: { repair: '1' } } : {})
      .pipe(map(r => r.data));
  }

  /** Arma el documento con las escenas y lo importa como borrador (`imported`), pide reparar o falla. */
  generationAssemble(id: string) {
    return this.http.post<ApiResponse<Generation>>(`${this.API_GENERACION}/${encodeURIComponent(id)}/assemble`, {})
      .pipe(map(r => r.data));
  }

  cancelGeneration(id: string) {
    return this.http.delete<ApiResponse<Generation>>(`${this.API_GENERACION}/${encodeURIComponent(id)}`)
      .pipe(map(r => r.data));
  }

  // ─── Biblioteca de lugares ───────────────────────────────────────────────────

  /** Los lugares que ofrece la biblioteca, en el orden de su índice. */
  libraryPlaces() {
    return this.http.get<ApiResponse<LugarResumen[]>>(this.API_LUGARES)
      .pipe(map(r => r.data));
  }

  /** Un lugar completo (salas, catálogo, personajes, hitos); las imágenes ya vienen con su dirección pública. */
  libraryPlace(placeId: string) {
    return this.http.get<ApiResponse<Escenario>>(`${this.API_LUGARES}/${encodeURIComponent(placeId)}`)
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
  saveWorld(caseVersionId: number, body: WorldRoomSaveRequest | WorldDialoguesSaveRequest, nodeId?: number) {
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

  /** El plano de las salas por piezas del caso para el editor (`layout` del contrato 2.2, §5.2, sin sala actual); null si no tiene. */
  casePlan(caseVersionId: number) {
    return this.http.get<ApiResponse<{ plan: unknown }>>(`${this.API}/${caseVersionId}/plan`)
      .pipe(map(response => response.data.plan));
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
        tap({
          next: () => {
            // Aprobar o archivar cambia qué casos ven los estudiantes: la lista guardada ya no sirve.
            this.caseList.invalidate();
            this.caseChanged.next(caseVersionId);
          },
          error: (err: unknown) => { if (isStaleCase(err)) this.caseChanged.next(caseVersionId); },
        }),
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
