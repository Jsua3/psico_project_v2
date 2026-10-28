/**
 * Un servidor de autoría en memoria para probar el store del editor sin red. Responde como el de verdad en lo que
 * importa al store: cada escritura compara la revisión que llega con la vigente (409 si está vencida), la sube y
 * devuelve la vista nueva; crear algo le da un id; borrar una escena con respuestas que llegan a ella es un 400.
 *
 * Guarda cada llamada (`llamadas`) con el método, la revisión que llevaba y los argumentos, para que la prueba diga
 * «esta acción llamó a esta ruta con la revisión que devolvió la anterior».
 */
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import type { AuthoringApi } from '../../../core/api/authoring.api';
import type { AssistantProposeBody } from '../../../core/api/generated/openapi-contracts';
import type {
  BriefUpdateRequest, CaseEditorView, CaseLifecycle, CaseReviewInfo, ChecklistUpdateRequest, CaseTransitionRequest, CaseValidation, CharacterUpsertRequest, ValidationIssue, DecisionOptionUpsertRequest, DialogueUpsertRequest, EndingRule, MapUpsertRequest,
  Milestone, NodeUpsertRequest, RiskLevel, WorldDefinition, WorldDialogueTree, WorldRoomSaveRequest,
} from '../../../core/models/simulation.model';
import type { Escenario } from '../modelo/escenario';
import { type CasoApi, mundoVacio } from './caso-api';

export interface Llamada {
  metodo: string;
  /** La revisión que llevaba la petición (`undefined` si no llevaba). */
  revision: number | undefined;
  /** El cuerpo o los ids, tal como llegaron. */
  args: unknown[];
}

type Respuesta<T> = Observable<T>;

const clonar = <T>(valor: T): T => structuredClone(valor);

function conflicto409(revision: number, current: CaseEditorView): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { success: false, code: 'REVISION_CONFLICT', message: 'El caso cambió.', revision, current },
  });
}

/** Las claves de hito que nombra una condición (`all`, `any`, `not`, `milestone`). */
function hitosDe(condicion: unknown): string[] {
  if (typeof condicion !== 'object' || condicion === null) return [];
  const c = condicion as Record<string, unknown>;
  const hijos = [...(Array.isArray(c['all']) ? c['all'] : []), ...(Array.isArray(c['any']) ? c['any'] : []), ...(c['not'] ? [c['not']] : [])];
  return [...(typeof c['milestone'] === 'string' ? [c['milestone']] : []), ...hijos.flatMap(hitosDe)];
}

const rechazo = (campo: string, mensaje: string) =>
  new HttpErrorResponse({ status: 400, error: { success: false, code: 'VALIDATION_ERROR', message: mensaje, field: campo } });

export class ServidorFalso {
  readonly llamadas: Llamada[] = [];
  /** Lo que la validación del caso (`validateCase`) devuelve. */
  hallazgos: ValidationIssue[] = [];
  /** Lo que impide enviar a revisión: el 409 de la transición trae estos bloqueos. */
  bloqueos: Array<{ code: string; message: string; issues?: ValidationIssue[] }> = [];
  readonly editor: CaseEditorView;
  readonly mundos = new Map<number, WorldDefinition>();
  /** Lo que emite `AuthoringApi.caseChanges`: el id de un caso que cambió bajo quien lo muestra (una transición aplicada o un 409 de estado). */
  readonly cambiosDelCaso = new Subject<number>();
  /** Lo que el servidor dice de la última revisión del caso (`lifecycle.review`): quién decidió, con qué motivo y nota. */
  ultimaRevision: CaseReviewInfo | undefined;
  /** Errores que un método devuelve: tras dejar pasar `saltar` llamadas, falla `veces` veces. */
  private readonly fallos = new Map<string, { error: HttpErrorResponse; saltar: number; veces: number }>();
  private siguienteId = 5000;

  constructor(caso: CasoApi, private readonly lugar: Escenario | null = null) {
    this.editor = clonar(caso.editor);
    for (const mundo of caso.mundos) this.mundos.set(mundo.nodeId, clonar(mundo));
  }

  /** Que la próxima llamada a `metodo` falle con este error (o, con `opciones`, otra: tras `saltar` llamadas, `veces` veces). */
  fallar(metodo: string, estado: number, mensaje = 'Falló.', opciones: { saltar?: number; veces?: number; campo?: string } = {}): void {
    const error = new HttpErrorResponse({ status: estado, error: { success: false, code: 'ERROR', message: mensaje, ...(opciones.campo ? { field: opciones.campo } : {}) } });
    this.fallos.set(metodo, { error, saltar: opciones.saltar ?? 0, veces: opciones.veces ?? 1 });
  }

  /** Otra sesión escribió: la revisión sube sin que el store lo sepa. */
  otraSesionEscribe(): void {
    this.editor.revision += 1;
  }

  llamadasA(metodo: string): Llamada[] {
    return this.llamadas.filter((l) => l.metodo === metodo);
  }

  get metodos(): string[] {
    return this.llamadas.map((l) => l.metodo);
  }

  private id(): number {
    return this.siguienteId++;
  }

  /** Registra la llamada y devuelve el error pendiente de ese método, si lo hay. */
  private entrar(metodo: string, revision: number | undefined, args: unknown[]): HttpErrorResponse | null {
    this.llamadas.push({ metodo, revision: revision ?? undefined, args: clonar(args) });
    const fallo = this.fallos.get(metodo);
    if (fallo) {
      if (fallo.saltar > 0) {
        fallo.saltar--;
      } else {
        if (--fallo.veces <= 0) this.fallos.delete(metodo);
        return fallo.error;
      }
    }
    if (revision !== undefined && revision !== this.editor.revision) return conflicto409(this.editor.revision, clonar(this.editor));
    return null;
  }

  private escribir(metodo: string, revision: number | undefined, args: unknown[], cambio: () => void): Respuesta<CaseEditorView> {
    const error = this.entrar(metodo, revision, args);
    if (error) return throwError(() => error);
    try {
      cambio();
    } catch (e) {
      return throwError(() => e);
    }
    this.editor.revision += 1;
    return of(clonar(this.editor));
  }

  private mundoDeMapa(mapId: number): WorldDefinition | undefined {
    return [...this.mundos.values()].find((m) => m.map.id === mapId);
  }

  readonly api = {
    caseChanges: this.cambiosDelCaso.asObservable(),
    caseEditor: (cv: number) => {
      const error = this.entrar('caseEditor', undefined, [cv]);
      return error ? throwError(() => error) : of(clonar(this.editor));
    },
    worldEditor: (cv: number, nodeId?: number) => {
      const error = this.entrar('worldEditor', undefined, [cv, nodeId]);
      if (error) return throwError(() => error);
      const mundo = this.mundos.get(nodeId ?? -1);
      return mundo ? of(clonar({ ...mundo, revision: this.editor.revision })) : throwError(() => new HttpErrorResponse({ status: 404 }));
    },
    libraryPlace: (id: string) => {
      this.entrar('libraryPlace', undefined, [id]);
      return this.lugar ? of(clonar(this.lugar)) : throwError(() => new HttpErrorResponse({ status: 404 }));
    },
    libraryPlaces: () => {
      this.entrar('libraryPlaces', undefined, []);
      return of([]);
    },
    createCase: (cuerpo: { title: string }) => {
      const error = this.entrar('createCase', undefined, [cuerpo]);
      return error ? throwError(() => error) : of(clonar(this.editor));
    },

    createNode: (cv: number, cuerpo: NodeUpsertRequest, revision?: number) =>
      this.escribir('createNode', revision, [cuerpo], () => {
        this.editor.nodes.push({
          id: this.id(), key: cuerpo.nodeKey, title: cuerpo.title, narrative: cuerpo.narrative, supportResources: cuerpo.supportResources,
          requiredTools: cuerpo.requiredTools, sensitiveContent: cuerpo.sensitiveContent, safeExitRequired: cuerpo.safeExitRequired,
          warningMessage: cuerpo.warningMessage, terminal: cuerpo.terminal, startNode: cuerpo.startNode, positionX: cuerpo.positionX,
          positionY: cuerpo.positionY, intensity: cuerpo.intensity ?? 'MEDIUM', decisionPrompt: '',
          displayOrder: this.editor.nodes.length, aiSuggested: cuerpo.aiSuggested === true,
        });
      }),
    updateNode: (cv: number, nodeId: number, cuerpo: NodeUpsertRequest, revision?: number) =>
      this.escribir('updateNode', revision, [nodeId, cuerpo], () => {
        const nodo = this.editor.nodes.find((n) => n.id === nodeId);
        if (!nodo) throw new HttpErrorResponse({ status: 404 });
        Object.assign(nodo, {
          title: cuerpo.title, warningMessage: cuerpo.warningMessage, terminal: cuerpo.terminal, startNode: cuerpo.startNode,
          positionX: cuerpo.positionX, positionY: cuerpo.positionY, intensity: cuerpo.intensity ?? nodo.intensity,
          supportResources: cuerpo.supportResources ?? nodo.supportResources,
        });
        if (cuerpo.aiSuggested !== undefined) nodo.aiSuggested = cuerpo.aiSuggested; // como el servidor: ausente = no se toca
      }),
    deleteNode: (cv: number, nodeId: number, revision?: number) =>
      this.escribir('deleteNode', revision, [nodeId], () => {
        const llegan = this.editor.decisions.filter((d) => d.targetNodeId === nodeId && d.sourceNodeId !== nodeId);
        if (llegan.length) {
          throw new HttpErrorResponse({ status: 400, error: { code: 'NODE_HAS_INCOMING_DECISIONS', message: 'Llegan decisiones.' } });
        }
        this.editor.nodes = this.editor.nodes.filter((n) => n.id !== nodeId);
        this.editor.decisions = this.editor.decisions.filter((d) => d.sourceNodeId !== nodeId);
        this.editor.maps = this.editor.maps.filter((m) => m.nodeId !== nodeId);
        this.mundos.delete(nodeId);
      }),

    createMap: (cv: number, cuerpo: MapUpsertRequest, revision?: number) =>
      this.escribir('createMap', revision, [cuerpo], () => {
        const nodo = this.editor.nodes.find((n) => n.id === cuerpo.nodeId);
        if (!nodo) throw new HttpErrorResponse({ status: 404 });
        const mapa = {
          id: this.id(), key: cuerpo.mapKey, title: cuerpo.title, width: cuerpo.width, height: cuerpo.height, theme: cuerpo.theme,
          spawnX: cuerpo.spawnX, spawnY: cuerpo.spawnY, nodeId: nodo.id, nodeKey: nodo.key,
        };
        this.editor.maps.push(mapa);
        this.mundos.set(nodo.id, mundoVacio(nodo.id, { ...mapa, ambient: {} }, this.editor.revision, cv));
      }),

    createDecision: (cv: number, cuerpo: DecisionOptionUpsertRequest, revision?: number) =>
      this.escribir('createDecision', revision, [cuerpo], () => {
        if (!cuerpo.responseClass) {
          throw new HttpErrorResponse({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'Falta la clase.', field: 'responseClass' } });
        }
        const origen = this.editor.nodes.find((n) => n.id === cuerpo.sourceNodeId);
        const destino = this.editor.nodes.find((n) => n.id === cuerpo.targetNodeId);
        if (!origen || !destino) throw new HttpErrorResponse({ status: 404 });
        this.editor.decisions.push({
          id: this.id(), optionKey: cuerpo.optionKey ?? 'sin-clave', sourceNodeId: origen.id, sourceKey: origen.key,
          targetNodeId: destino.id, targetKey: destino.key, text: cuerpo.text, responseClass: cuerpo.responseClass,
          prohibitedConduct: cuerpo.responseClass === 'CONTRAINDICATED', prohibitionReason: cuerpo.prohibitionReason ?? null,
          immediateFeedback: cuerpo.immediateFeedback ?? '', effects: cuerpo.effects ?? {}, consequenceText: '', theoryBasis: '',
          feedbackText: cuerpo.feedbackText ?? '', aiSuggested: cuerpo.aiSuggested === true,
        });
      }),
    updateDecision: (cv: number, decisionId: number, cuerpo: DecisionOptionUpsertRequest, revision?: number) =>
      this.escribir('updateDecision', revision, [decisionId, cuerpo], () => {
        const decision = this.editor.decisions.find((d) => d.id === decisionId);
        const destino = this.editor.nodes.find((n) => n.id === cuerpo.targetNodeId);
        if (!decision || !destino) throw new HttpErrorResponse({ status: 404 });
        Object.assign(decision, {
          targetNodeId: destino.id, targetKey: destino.key, text: cuerpo.text, responseClass: cuerpo.responseClass ?? decision.responseClass,
          prohibitionReason: cuerpo.prohibitionReason ?? null, feedbackText: cuerpo.feedbackText ?? '', effects: cuerpo.effects ?? decision.effects,
        });
        if (cuerpo.aiSuggested !== undefined) decision.aiSuggested = cuerpo.aiSuggested;
      }),
    deleteDecision: (cv: number, decisionId: number, revision?: number) =>
      this.escribir('deleteDecision', revision, [decisionId], () => {
        this.editor.decisions = this.editor.decisions.filter((d) => d.id !== decisionId);
      }),

    createDialogue: (cv: number, mapId: number, cuerpo: DialogueUpsertRequest, revision?: number) =>
      this.escribir('createDialogue', revision, [mapId, cuerpo], () => {
        const mundo = this.mundoDeMapa(mapId);
        if (!mundo) throw new HttpErrorResponse({ status: 404 });
        mundo.dialogues.push(this.arbol(cuerpo));
      }),
    updateDialogue: (cv: number, treeId: number, cuerpo: DialogueUpsertRequest, revision?: number) =>
      this.escribir('updateDialogue', revision, [treeId, cuerpo], () => {
        for (const mundo of this.mundos.values()) {
          const i = mundo.dialogues.findIndex((d) => d.id === treeId);
          if (i >= 0) {
            mundo.dialogues[i] = { ...this.arbol(cuerpo), id: treeId };
            return;
          }
        }
        throw new HttpErrorResponse({ status: 404 });
      }),
    deleteDialogue: (cv: number, treeId: number, revision?: number) =>
      this.escribir('deleteDialogue', revision, [treeId], () => {
        for (const mundo of this.mundos.values()) mundo.dialogues = mundo.dialogues.filter((d) => d.id !== treeId);
      }),

    createCharacter: (cv: number, cuerpo: CharacterUpsertRequest, revision?: number) =>
      this.escribir('createCharacter', revision, [cuerpo], () => {
        this.editor.characters.push({
          id: this.id(), key: cuerpo.characterKey, displayName: cuerpo.displayName, roleLabel: cuerpo.roleLabel ?? '',
          portraitKey: cuerpo.portraitKey ?? '', showInBrief: cuerpo.showInBrief ?? false, displayOrder: this.editor.characters.length,
        });
      }),

    updateMilestones: (cv: number, milestones: Milestone[], revision?: number) =>
      this.escribir('updateMilestones', revision, [milestones], () => {
        // Como el servidor: no deja quitar un hito que la condición de un final guardado todavía nombra.
        const quedan = new Set(milestones.map((m) => m.key));
        for (const quitado of this.editor.rules.milestones.filter((m) => !quedan.has(m.key))) {
          const final = this.editor.rules.endings.find((e) => hitosDe(e.when).includes(quitado.key));
          if (final) throw rechazo('milestones', `El hito «${quitado.key}» no se puede quitar: la condición del final «${final.key}» lo nombra.`);
        }
        this.editor.rules.milestones = clonar(milestones);
      }),
    updateRisk: (cv: number, riskLevel: RiskLevel | null, revision?: number) =>
      this.escribir('updateRisk', revision, [riskLevel], () => {
        this.editor.rules.riskLevel = riskLevel;
      }),
    updateEndings: (cv: number, endings: EndingRule[], revision?: number) =>
      this.escribir('updateEndings', revision, [endings], () => {
        // Como el servidor: la condición de un final no puede nombrar un hito que el caso no declara.
        const declarados = new Set(this.editor.rules.milestones.map((m) => m.key));
        for (const final of endings) {
          const falta = hitosDe(final.when).find((h) => !declarados.has(h));
          if (falta) throw rechazo('endings', `La condición del final «${final.key}» nombra el hito «${falta}», que el caso no declara.`);
        }
        this.editor.rules.endings = clonar(endings);
      }),

    updateBrief: (cv: number, cuerpo: BriefUpdateRequest, revision?: number) =>
      this.escribir('updateBrief', revision, [cuerpo], () => {
        if (cuerpo.context !== undefined) this.editor.context = cuerpo.context;
        if (cuerpo.learningObjectives !== undefined) this.editor.learningObjectives = [...cuerpo.learningObjectives];
      }),

    updateChecklist: (cv: number, cuerpo: ChecklistUpdateRequest, revision?: number) =>
      this.escribir('updateChecklist', revision, [cuerpo], () => {
        const marcados = cuerpo as unknown as Record<string, boolean>;
        for (const item of this.editor.checklist.items) item.fulfilled = marcados[item.code] === true;
        const obligatorios = this.editor.checklist.items.filter((i) => i.required);
        this.editor.checklistCompletion = obligatorios.length ? Math.round((100 * obligatorios.filter((i) => i.fulfilled).length) / obligatorios.length) : 0;
      }),

    validateCase: (cv: number) => {
      const error = this.entrar('validateCase', undefined, [cv]);
      if (error) return throwError(() => error);
      const issues = clonar(this.hallazgos);
      const resultado: CaseValidation = { issues, canPublish: !issues.some((i) => i.severity === 'error') };
      return of(resultado);
    },
    lifecycle: (cv: number) => {
      const error = this.entrar('lifecycle', undefined, [cv]);
      return error ? throwError(() => error) : of(this.ciclo());
    },
    transitionCase: (cv: number, cuerpo: CaseTransitionRequest, revision?: number) => {
      const error = this.entrar('transitionCase', revision, [cuerpo]);
      if (error) return throwError(() => error);
      if (this.editor.status !== 'DRAFT') {
        return throwError(() => new HttpErrorResponse({ status: 409, error: { success: false, code: 'INVALID_TRANSITION', message: 'No se puede.' } }));
      }
      const bloqueos = this.bloqueosEfectivos();
      if (bloqueos.length) {
        return throwError(() => new HttpErrorResponse({
          status: 409, error: { success: false, code: 'CASE_NOT_PUBLISHABLE', message: bloqueos[0].message, blockers: clonar(bloqueos) },
        }));
      }
      this.editor.status = 'IN_REVIEW';
      this.editor.revision += 1;
      return of(this.ciclo());
    },

    acceptAiNode: (cv: number, id: number, revision?: number) =>
      this.escribir('acceptAiNode', revision, [id], () => {
        const nodo = this.editor.nodes.find((n) => n.id === id);
        if (nodo) nodo.aiSuggested = false;
      }),
    acceptAiDecision: (cv: number, id: number, revision?: number) =>
      this.escribir('acceptAiDecision', revision, [id], () => {
        const decision = this.editor.decisions.find((d) => d.id === id);
        if (decision) decision.aiSuggested = false;
      }),
    acceptAiObject: (cv: number, id: number, revision?: number) =>
      this.escribir('acceptAiObject', revision, [id], () => {
        for (const mundo of this.mundos.values()) {
          for (const objeto of mundo.objects) if (objeto.id === id) objeto.aiSuggested = false;
        }
      }),
    acceptAiDialogue: (cv: number, id: number, revision?: number) =>
      this.escribir('acceptAiDialogue', revision, [id], () => {
        for (const mundo of this.mundos.values()) {
          for (const arbol of mundo.dialogues) if (arbol.id === id) arbol.lines.forEach((l) => (l.aiSuggested = false));
        }
      }),

    saveWorld: (cv: number, cuerpo: WorldRoomSaveRequest, nodeId?: number) => {
      const error = this.entrar('saveWorld', cuerpo.revision, [cuerpo, nodeId]);
      if (error) return throwError(() => error);
      const mundo = this.mundos.get(nodeId ?? -1);
      if (!mundo) return throwError(() => new HttpErrorResponse({ status: 404 }));
      // Como el servidor: una lista que no viene no se toca; la que viene reemplaza a la de la sala.
      if (cuerpo.map) mundo.map = clonar(cuerpo.map);
      if (cuerpo.objects) mundo.objects = cuerpo.objects.map((o) => ({ ...clonar(o), id: o.id || this.id() }));
      if (cuerpo.collisionZones) mundo.collisionZones = cuerpo.collisionZones.map((z) => ({ ...clonar(z), id: z.id || this.id() }));
      if (cuerpo.dialogues) {
        const duenio = (d: WorldDialogueTree) => (d.mapObjectKey ? mundo.objects.find((o) => o.key === d.mapObjectKey)?.id ?? null : d.mapObjectId ?? null);
        mundo.dialogues = cuerpo.dialogues.map((d) => ({ ...clonar(d), id: d.id || this.id(), mapObjectId: duenio(d) }));
      }
      // Un diálogo no puede colgar de una persona que ya no está en la sala: se va con ella.
      const quedan = new Set(mundo.objects.map((o) => o.id));
      mundo.dialogues = mundo.dialogues.filter((d) => d.mapObjectId === null || d.mapObjectId === undefined || quedan.has(d.mapObjectId));
      this.editor.revision += 1;
      mundo.revision = this.editor.revision;
      return of(clonar(mundo));
    },

    cloneCaseVersion: (cv: number) => {
      const error = this.entrar('cloneCaseVersion', undefined, [cv]);
      if (error) return throwError(() => error);
      return of({ ...clonar(this.editor), caseVersionId: this.editor.caseVersionId + 1000, status: 'DRAFT', revision: 1 });
    },

    assistantPropose: (cv: number, cuerpo: AssistantProposeBody) => {
      const error = this.entrar('assistantPropose', undefined, [cv, cuerpo]);
      if (error) return throwError(() => error);
      return of({ mensaje: 'Aquí va.', cambios: [], changes: 0, model: 'm', modo: 'connected' });
    },

    assistantStatus: (cv: number) => {
      this.entrar('assistantStatus', undefined, [cv]);
      return of({ enabled: true, mode: 'connected' as const, remainingToday: 10 });
    },
  };

  private ciclo(): CaseLifecycle {
    const estado = this.editor.status as CaseLifecycle['state'];
    return {
      caseVersionId: this.editor.caseVersionId, state: estado, ...(this.ultimaRevision ? { review: clonar(this.ultimaRevision) } : {}), allowedTransitions: estado === 'DRAFT' ? ['submit'] : estado === 'IN_REVIEW' ? ['approve', 'reject'] : ['archive', 'clone'],
      ...(estado === 'DRAFT' && this.bloqueosEfectivos().length
        ? { blockedReason: { code: this.bloqueosEfectivos()[0].code, message: this.bloqueosEfectivos()[0].message } } : {}),
    };
  }

  /** Lo que impide enviar: lo que la prueba puso y, si el caso trae su lista de verificación, que falte algún ítem obligatorio. */
  private bloqueosEfectivos(): ServidorFalso['bloqueos'] {
    const faltaLista = this.editor.checklist.items.some((i) => i.required && !i.fulfilled);
    return [
      ...(faltaLista ? [{ code: 'CHECKLIST_INCOMPLETE', message: 'El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.' }] : []),
      ...this.bloqueos,
    ];
  }

  /** Lo que la prueba pasa como `AuthoringApi`. */
  get autoria(): AuthoringApi {
    return this.api as unknown as AuthoringApi;
  }

  private arbol(cuerpo: DialogueUpsertRequest): WorldDialogueTree {
    return {
      id: this.id(), key: cuerpo.treeKey, speakerName: cuerpo.speakerName, portraitKey: cuerpo.portraitKey ?? null,
      emotion: cuerpo.emotion ?? 'neutral', mapObjectId: cuerpo.mapObjectId ?? null,
      lines: (cuerpo.lines ?? []).map((l) => ({
        order: l.displayOrder, speakerName: l.speakerName ?? cuerpo.speakerName, text: l.text, emotion: l.emotion ?? 'neutral',
        aiSuggested: l.aiSuggested === true,
      })),
      choices: [],
    };
  }
}
