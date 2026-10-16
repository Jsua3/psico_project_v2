import { DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { AuthoringApi } from '../../core/api/authoring.api';
import { RevisionConflict, revisionConflictOf } from '../../core/api/revision-conflict.util';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  CaseEditorView,
  ChecklistUpdateRequest,
  ClinicalToolEditorState,
  DecisionEdgeState,
  MapEditorState,
  MapObjectEditorState,
  NodeEditorState,
} from '../../core/models/simulation.model';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiConfirmOptions, UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { objectTypeLabel, statusLabel } from '../../shared/ui/labels';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiProgress } from '../../shared/ui/progress/ui-progress';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiTab, UiTabs } from '../../shared/ui/tabs/ui-tabs';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { CaseEditorSheetComponent, CaseEditorSheetData, CaseEditorSheetHost, EditorPanel } from './case-editor-sheet.component';
import { CaseReviewPanelComponent, ValidationTarget } from './case-review-panel.component';
import { mapThemeLabel, nodeOptionLabel, statusTone } from './case-editor.options';
import { DagEditorComponent } from './dag-editor.component';
import { describeEditorChanges } from './editor-changes.util';
import { publishReadiness } from './publish-readiness.util';
import { RevisionConflictAnswer, RevisionConflictDialogComponent, RevisionConflictDialogData } from './revision-conflict-dialog.component';
import { WorldEditorComponent } from './world-editor';
import { WorldPreviewComponent } from './world-preview.component';

/** Una petición del editor: recibe la revisión con la que se envía (null/undefined = sin cabecera) y devuelve la vista nueva. */
type EditorCall = (revision: number | undefined) => Observable<CaseEditorView>;

/**
 * Editor de casos en el sistema de la biblioteca (plan visual F8-1): cabecera con el estado en una insignia y la lista
 * de publicación real (ítems con su cumplimiento, constancia de revisión de contenido solo lectura), «Publicar» solo
 * para el administrador y con el motivo si no se puede, pestañas `ui-tabs`, formularios en una hoja lateral con foco
 * y Esc, carga con esqueleto y error con «Reintentar», y la revisión del caso (E2-6) en cada guardado: un 409 abre la
 * comparación («Recargar» o «Reintentar»). Una versión que no es borrador es de solo lectura, con su motivo.
 */
@Component({
  selector: 'app-case-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink,
    UiBadge, UiButton, UiCard, UiIconButton, UiPageActions, UiPageHeader, UiProgress, UiSection, UiSkeleton, UiTab, UiTabs,
    UiEmptyState, UiErrorState,
    CaseReviewPanelComponent, DagEditorComponent, WorldPreviewComponent, WorldEditorComponent,
  ],
  templateUrl: './case-editor.component.html',
  styleUrl: './case-editor.component.scss',
  // Eager: los errores de los campos de la hoja salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CaseEditorComponent implements OnInit, CaseEditorSheetHost {
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly objectTypeLabel = objectTypeLabel;
  readonly mapThemeLabel = mapThemeLabel;
  /** «Sala de urgencias (urgencias-crisis)»: el título primero, la clave entre paréntesis (RF-08). */
  readonly nodeOptionLabel = nodeOptionLabel;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authoringApi = inject(AuthoringApi);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(UiDialog);
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** La hoja abierta con el formulario (null si no hay). */
  private sheet: DialogRef<void, CaseEditorSheetComponent> | null = null;
  /** true mientras hay una confirmación abierta: un segundo gesto no abre otra ni repite la acción. */
  private confirming = false;

  readonly editor = signal<CaseEditorView | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  /** El fallo de la CARGA (el texto técnico; lo que se lee sale del catálogo de estados). */
  readonly error = signal('');
  readonly errorStatus = signal<number | null>(null);
  readonly panel = signal<EditorPanel>(null);
  /** Pestaña abierta (clave de `uiTab`). */
  readonly tab = signal<string | undefined>('grafo');
  readonly selectedWorldNodeId = signal<number | null>(null);

  nodeForm: FormGroup | null = null;
  decisionForm: FormGroup | null = null;
  mapForm: FormGroup | null = null;
  objectForm: FormGroup | null = null;
  toolForm: FormGroup | null = null;
  checklistForm: FormGroup | null = null;

  /** Estado de la pantalla: una sola señal, de a uno (carga, error o listo). */
  readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => false),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando el editor…' : ''));
  protected readonly errorKind = computed(() => errorKindFromStatus(this.errorStatus()));

  /** Solo el administrador publica (matriz `case.publish`); el motivo dice qué falta. */
  protected readonly readiness = computed(() => {
    const view = this.editor();
    return view ? publishReadiness(view, this.auth.currentUser()?.role) : { allowed: false, reason: null };
  });
  /** Una versión que no es borrador no admite cambios (el servidor responde 400): se dice antes de abrir un formulario. */
  readonly lockReason = computed(() => {
    const status = (this.editor()?.status ?? 'DRAFT').toUpperCase();
    return status === 'DRAFT'
      ? null
      : 'Esta versión no es un borrador y no se puede modificar: clónala para editarla.';
  });
  protected readonly busyReason = computed(() => (this.busy() ? 'Hay una acción en curso: espera a que termine.' : null));
  /** Cada mapa es la sala de un nodo: sin nodos no se puede crear uno. */
  protected readonly mapCreateReason = computed(() =>
    this.lockReason() ?? ((this.editor()?.nodes.length ?? 0) === 0 ? 'Crea un nodo primero: cada mapa es la sala de un nodo.' : null));
  /** Cada objeto vive en un mapa: sin mapas no se puede crear uno. */
  protected readonly objectCreateReason = computed(() =>
    this.lockReason() ?? ((this.editor()?.maps.length ?? 0) === 0 ? 'Crea un mapa primero.' : null));
  private readonly nodeTitles = computed(() => new Map((this.editor()?.nodes ?? []).map(node => [node.id, node.title])));
  private readonly mapTitles = computed(() => new Map((this.editor()?.maps ?? []).map(map => [map.id, map.title])));
  protected readonly previewNodes = computed(() =>
    (this.editor()?.nodes ?? []).map(node => ({ id: node.id, key: node.key, title: node.title })));

  ngOnInit(): void {
    this.load();
  }

  // ─── Carga ───────────────────────────────────────────────────────────────────────────────────────────────────────

  load(): void {
    const caseVersionId = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    this.loading.set(true);
    this.error.set('');
    this.errorStatus.set(null);
    this.authoringApi.caseEditor(caseVersionId).subscribe({
      next: model => {
        this.adopt(model, true);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.errorStatus.set(err instanceof HttpErrorResponse ? err.status : null);
        this.error.set('No se pudo cargar el editor.');
        this.loading.set(false);
      },
    });
  }

  /** Adopta la vista que devolvió el servidor (la revisión siguiente viaja en ella). */
  private adopt(model: CaseEditorView, force = false): void {
    const switched = this.editor() !== null && this.editor()!.caseVersionId !== model.caseVersionId;
    this.editor.set(model);
    if (switched) this.selectedWorldNodeId.set(null);
    // Las casillas sin guardar no se pierden al guardar otra cosa; una recarga o un cambio de versión sí las renueva.
    if (force || switched || !this.checklistForm || this.checklistForm.pristine) this.buildChecklistForm(model);
  }

  private buildChecklistForm(model: CaseEditorView): void {
    const controls: Record<string, [boolean]> = {};
    for (const item of model.checklist?.items ?? []) controls[item.code] = [item.fulfilled];
    this.checklistForm = this.fb.group(controls);
  }

  // ─── Hoja de formularios ─────────────────────────────────────────────────────────────────────────────────────────

  openPanel(p: NonNullable<EditorPanel>): void {
    if (!this.ensureEditable()) return;
    this.panel.set(p);
    if (p.kind === 'node-create') this.initNodeForm(null);
    else if (p.kind === 'node-edit') this.initNodeForm(p.node);
    else if (p.kind === 'decision-create') this.initDecisionForm(null, p.sourceNode ?? null);
    else if (p.kind === 'decision-edit') this.initDecisionForm(p.edge, null);
    else if (p.kind === 'map-create') this.initMapForm(null);
    else if (p.kind === 'map-edit') this.initMapForm(p.map);
    else if (p.kind === 'object-create') this.initObjectForm(null, p.mapId);
    else if (p.kind === 'object-edit') this.initObjectForm(p.obj, null);
    else if (p.kind === 'tool-create') this.initToolForm(null);
    else if (p.kind === 'tool-edit') this.initToolForm(p.tool);
    this.openSheet();
  }

  /** Abre la hoja (si ya estaba abierta la conserva: el contenedor es el mismo y cambia el formulario). */
  private openSheet(): void {
    if (this.sheet) return;
    const ref = this.dialog.sheet<void, CaseEditorSheetData, CaseEditorSheetComponent>(CaseEditorSheetComponent, {
      side: 'end',
      data: { host: this },
    });
    this.sheet = ref;
    ref.closed?.subscribe(() => {
      if (this.sheet === ref) {
        this.sheet = null;
        this.panel.set(null);
      }
    });
  }

  closePanel(): void {
    this.panel.set(null);
    const ref = this.sheet;
    this.sheet = null;
    ref?.close();
  }

  panelTitle(): string {
    const p = this.panel();
    if (!p) return '';
    const titles: Record<string, string> = {
      'node-create': 'Nuevo nodo DAG',
      'node-edit': 'Editar nodo',
      'decision-create': 'Nueva decisión',
      'decision-edit': 'Editar decisión',
      'map-create': 'Nuevo mapa',
      'map-edit': 'Editar mapa',
      'object-create': 'Nuevo objeto del mapa',
      'object-edit': 'Editar objeto',
      'tool-create': 'Nueva herramienta clínica',
      'tool-edit': 'Editar herramienta',
    };
    return titles[p.kind] ?? '';
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  /** Envía el formulario de la hoja: incompleto, marca los campos y lleva el foco al primero inválido. */
  save(): void {
    const kind = this.panel()?.kind;
    const form = this.activeForm();
    const caseVersionId = this.editor()?.caseVersionId;
    if (!kind || !form || caseVersionId == null || this.busy()) return;
    if (form.invalid) {
      form.markAllAsTouched();
      // El foco va al primer campo inválido: la hoja vive en la capa superior, no dentro de esta pantalla.
      focusFirstInvalid(this.sheetElement() ?? this.host.nativeElement);
      return;
    }
    switch (kind.split('-')[0]) {
      case 'node': this.saveNode(caseVersionId); break;
      case 'decision': this.saveDecision(caseVersionId); break;
      case 'map': this.saveMap(caseVersionId); break;
      case 'object': this.saveObject(caseVersionId); break;
      case 'tool': this.saveTool(caseVersionId); break;
    }
  }

  private activeForm(): FormGroup | null {
    switch ((this.panel()?.kind ?? '').split('-')[0]) {
      case 'node': return this.nodeForm;
      case 'decision': return this.decisionForm;
      case 'map': return this.mapForm;
      case 'object': return this.objectForm;
      case 'tool': return this.toolForm;
      default: return null;
    }
  }

  /** La capa de la hoja abierta (donde viven los campos), para llevar el foco al primer campo inválido. */
  private sheetElement(): HTMLElement | null {
    return (this.sheet?.overlayRef?.overlayElement as HTMLElement | undefined) ?? null;
  }

  // ─── Inicializadores de formulario ───────────────────────────────────────────────────────────────────────────────

  private initNodeForm(node: NodeEditorState | null): void {
    this.nodeForm = this.fb.group({
      nodeKey: [node?.key ?? '', Validators.required],
      title: [node?.title ?? '', Validators.required],
      narrative: [node?.narrative ?? '', Validators.required],
      warningMessage: [node?.warningMessage ?? ''],
      startNode: [node?.startNode ?? false],
      terminal: [node?.terminal ?? false],
      sensitiveContent: [node?.sensitiveContent ?? false],
      safeExitRequired: [node?.safeExitRequired ?? false],
      positionX: [node?.positionX ?? null],
      positionY: [node?.positionY ?? null],
    });
  }

  private initDecisionForm(edge: DecisionEdgeState | null, sourceNode: NodeEditorState | null): void {
    this.decisionForm = this.fb.group({
      sourceNodeId: [edge?.sourceNodeId ?? sourceNode?.id ?? null, Validators.required],
      targetNodeId: [edge?.targetNodeId ?? null, Validators.required],
      optionKey: [edge?.optionKey ?? ''],
      text: [edge?.text ?? '', Validators.required],
      classification: [edge?.classification ?? 'ADEQUATE', Validators.required],
      prohibitedConduct: [edge?.prohibitedConduct ?? false],
      prohibitionReason: [edge?.prohibitionReason ?? ''],
      scoreDelta: [edge?.scoreDelta ?? 10],
      stressDelta: [edge?.stressDelta ?? 0],
      prohibitedPenalty: [edge?.prohibitedPenalty ?? 0],
      immediateFeedback: [edge?.immediateFeedback ?? ''],
    });
  }

  private initMapForm(map: MapEditorState | null): void {
    this.mapForm = this.fb.group({
      nodeId: [map?.nodeId ?? null, Validators.required],
      mapKey: [map?.key ?? '', Validators.required],
      title: [map?.title ?? '', Validators.required],
      theme: [map?.theme ?? 'clinical-soft'],
      width: [map?.width ?? 960],
      height: [map?.height ?? 540],
      spawnX: [map?.spawnX ?? 145],
      spawnY: [map?.spawnY ?? 430],
    });
  }

  private initObjectForm(obj: MapObjectEditorState | null, mapId: number | null): void {
    this.objectForm = this.fb.group({
      _mapId: [obj?.mapId ?? mapId, Validators.required],
      objectKey: [obj?.key ?? '', Validators.required],
      label: [obj?.label ?? '', Validators.required],
      objectType: [obj?.type ?? 'PERSON', Validators.required],
      interactionPrompt: [obj?.interactionPrompt ?? '', Validators.required],
      interactionText: [obj?.interactionText ?? ''],
      x: [obj?.x ?? 200],
      y: [obj?.y ?? 300],
      width: [obj?.width ?? 48],
      height: [obj?.height ?? 48],
      colorHex: [obj?.colorHex ?? '#4FA3A5'],
      shortCode: [obj?.shortCode ?? 'ACT'],
      icon: [obj?.icon ?? 'psychology'],
      decisionOptionId: [obj?.decisionOptionId ?? null],
      toolCode: [obj?.toolCode ?? null],
      collision: [obj?.collision ?? false],
      visible: [obj?.visible ?? true],
    });
  }

  private initToolForm(tool: ClinicalToolEditorState | null): void {
    this.toolForm = this.fb.group({
      toolCode: [tool?.code ?? '', Validators.required],
      label: [tool?.label ?? '', Validators.required],
      icon: [tool?.icon ?? 'psychology'],
      category: [tool?.category ?? 'clinical'],
      description: [tool?.description ?? '', Validators.required],
    });
  }

  // ─── Guardar ─────────────────────────────────────────────────────────────────────────────────────────────────────

  saveNode(caseVersionId: number): void {
    if (!this.nodeForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.nodeForm.value;
    const editing = p?.kind === 'node-edit' ? p.node : null;
    const body = {
      nodeKey: v.nodeKey, title: v.title, narrative: v.narrative,
      // El formulario no edita estas listas: al editar se devuelven las del nodo (antes
      // se enviaban vacías y guardar el título las borraba); un nodo nuevo parte vacío.
      requiredTools: editing?.requiredTools ?? [],
      supportResources: editing?.supportResources ?? [],
      sensitiveContent: v.sensitiveContent, safeExitRequired: v.safeExitRequired,
      warningMessage: v.warningMessage || null,
      terminal: v.terminal, startNode: v.startNode,
      positionX: v.positionX, positionY: v.positionY,
    };
    this.runAction(
      revision => editing
        ? this.authoringApi.updateNode(caseVersionId, editing.id, body, revision)
        : this.authoringApi.createNode(caseVersionId, body, revision),
      'Nodo guardado.', 'No fue posible guardar el nodo.',
    );
  }

  saveDecision(caseVersionId: number): void {
    if (!this.decisionForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.decisionForm.value;
    const body = {
      sourceNodeId: Number(v.sourceNodeId), targetNodeId: Number(v.targetNodeId),
      optionKey: v.optionKey || null, text: v.text, classification: v.classification,
      prohibitedConduct: v.prohibitedConduct, prohibitionReason: v.prohibitionReason || null,
      scoreDelta: v.scoreDelta, stressDelta: v.stressDelta,
      prohibitedPenalty: v.prohibitedPenalty, immediateFeedback: v.immediateFeedback || '',
    };
    const editingId = p?.kind === 'decision-edit' ? p.edge.id : null;
    this.runAction(
      revision => editingId !== null
        ? this.authoringApi.updateDecision(caseVersionId, editingId, body, revision)
        : this.authoringApi.createDecision(caseVersionId, body, revision),
      'Decisión guardada.', 'No fue posible guardar la decisión.',
    );
  }

  saveMap(caseVersionId: number): void {
    if (!this.mapForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.mapForm.value;
    const body = {
      nodeId: Number(v.nodeId), mapKey: v.mapKey, title: v.title,
      width: v.width, height: v.height, theme: v.theme,
      spawnX: v.spawnX, spawnY: v.spawnY,
    };
    const editingId = p?.kind === 'map-edit' ? p.map.id : null;
    this.runAction(
      revision => editingId !== null
        ? this.authoringApi.updateMap(caseVersionId, editingId, body, revision)
        : this.authoringApi.createMap(caseVersionId, body, revision),
      'Mapa guardado.', 'No fue posible guardar el mapa.',
    );
  }

  saveObject(caseVersionId: number): void {
    if (!this.objectForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.objectForm.value;
    const body = {
      objectKey: v.objectKey, label: v.label, objectType: v.objectType,
      x: v.x, y: v.y, width: v.width, height: v.height,
      colorHex: v.colorHex, icon: v.icon, shortCode: v.shortCode,
      collision: v.collision, visible: v.visible,
      interactionPrompt: v.interactionPrompt, interactionText: v.interactionText || '',
      decisionOptionId: v.decisionOptionId ? Number(v.decisionOptionId) : null,
      toolCode: v.toolCode || null,
    };
    const editingId = p?.kind === 'object-edit' ? p.obj.id : null;
    // El mapa lo elige la hoja al crear (parte del de la tarjeta o del primero).
    const mapId = Number(v._mapId);
    this.runAction(
      revision => editingId !== null
        ? this.authoringApi.updateObject(caseVersionId, editingId, body, revision)
        : this.authoringApi.createObject(caseVersionId, mapId, body, revision),
      'Objeto guardado.', 'No fue posible guardar el objeto.',
    );
  }

  saveTool(caseVersionId: number): void {
    if (!this.toolForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.toolForm.value;
    const body = { toolCode: v.toolCode, label: v.label, icon: v.icon, category: v.category, description: v.description };
    const editingId = p?.kind === 'tool-edit' ? p.tool.id : null;
    this.runAction(
      revision => editingId !== null
        ? this.authoringApi.updateTool(caseVersionId, editingId, body, revision)
        : this.authoringApi.createTool(caseVersionId, body, revision),
      'Herramienta guardada.', 'No fue posible guardar la herramienta.',
    );
  }

  saveChecklist(caseVersionId: number): void {
    if (!this.checklistForm || this.busy()) return;
    const body = this.checklistForm.getRawValue() as ChecklistUpdateRequest;
    this.runAction(
      revision => this.authoringApi.updateChecklist(caseVersionId, body, revision),
      'Lista de verificación guardada.',
      'No fue posible guardar la lista de verificación.',
      () => this.checklistForm?.markAsPristine(),
    );
  }

  // ─── Eliminar ────────────────────────────────────────────────────────────────────────────────────────────────────

  async confirmDeleteNode(caseVersionId: number, node: NodeEditorState): Promise<void> {
    const confirmed = await this.confirmDanger(
      'Eliminar nodo',
      `¿Eliminar el nodo "${node.title}"? Esta acción eliminará también sus decisiones, mapa y objetos.`,
    );
    if (confirmed) {
      this.runAction(
        revision => this.authoringApi.deleteNode(caseVersionId, node.id, revision),
        'Nodo eliminado.', 'No fue posible eliminar el nodo.',
      );
    }
  }

  async confirmDeleteMap(caseVersionId: number, map: MapEditorState): Promise<void> {
    const confirmed = await this.confirmDanger(
      'Eliminar mapa',
      `¿Eliminar el mapa "${map.title}"? Esta acción eliminará también sus objetos y colisiones.`,
    );
    if (confirmed) {
      this.runAction(
        revision => this.authoringApi.deleteMap(caseVersionId, map.id, revision),
        'Mapa eliminado.', 'No fue posible eliminar el mapa.',
      );
    }
  }

  async confirmDeleteObject(caseVersionId: number, obj: MapObjectEditorState): Promise<void> {
    const confirmed = await this.confirmDanger('Eliminar objeto', `¿Eliminar el objeto "${obj.label}"?`);
    if (confirmed) {
      this.runAction(
        revision => this.authoringApi.deleteObject(caseVersionId, obj.id, revision),
        'Objeto eliminado.', 'No fue posible eliminar el objeto.',
      );
    }
  }

  async confirmDeleteTool(caseVersionId: number, tool: ClinicalToolEditorState): Promise<void> {
    const confirmed = await this.confirmDanger('Eliminar herramienta', `¿Eliminar la herramienta "${tool.label}"?`);
    if (confirmed) {
      this.runAction(
        revision => this.authoringApi.deleteTool(caseVersionId, tool.id, revision),
        'Herramienta eliminada.', 'No fue posible eliminar la herramienta.',
      );
    }
  }

  // ─── Publicar y clonar ───────────────────────────────────────────────────────────────────────────────────────────

  async confirmPublish(caseVersionId: number): Promise<void> {
    const confirmed = await this.confirmOnce({
      title: 'Publicar caso',
      message: 'Los estudiantes asignados verán esta versión en su catálogo. ¿Publicarla ahora?',
      confirmLabel: 'Publicar',
    });
    if (confirmed) this.publish(caseVersionId);
  }

  publish(caseVersionId: number): void {
    this.runAction(
      revision => this.authoringApi.publishCase(caseVersionId, revision),
      'Caso publicado.', 'No fue posible publicar el caso.',
    );
  }

  /** Clona la versión y abre la copia: la URL pasa a ser la de la versión nueva (recargar no vuelve a la anterior). */
  clone(caseVersionId: number): void {
    this.runAction(
      () => this.authoringApi.cloneCaseVersion(caseVersionId),
      'Se creó una nueva versión del caso.', 'No fue posible clonar la versión.',
      view => void this.router.navigate(['/portal/casos', view.caseVersionId, 'editor'], { replaceUrl: true }),
    );
  }

  // ─── Ayudas de la plantilla ──────────────────────────────────────────────────────────────────────────────────────

  /** El título del nodo (la clave solo si el nodo ya no está en el caso). */
  nodeTitle(nodeId: number, fallback: string): string {
    return this.nodeTitles().get(nodeId) ?? fallback;
  }

  mapTitle(mapId: number): string {
    return this.mapTitles().get(mapId) ?? 'otro mapa';
  }

  /** «Nuevo objeto» desde la pestaña: el mapa se elige en la hoja (parte del primero). */
  openObjectCreate(): void {
    const first = this.editor()?.maps[0];
    if (first) this.openPanel({ kind: 'object-create', mapId: first.id });
  }

  goToRubrics(): void {
    void this.router.navigate(['/portal/rubricas']);
  }

  /**
   * Un hallazgo de la validación (F10-6†): el de un mapa lleva al editor de mundo de su sala (ahí se ven el punto de
   * aparición, los objetos y las zonas); el de una escena abre la hoja de edición del nodo.
   */
  openReviewIssue(target: ValidationTarget): void {
    const view = this.editor();
    if (!view) return;
    if (target.mapId !== undefined) {
      const map = view.maps.find(item => item.id === target.mapId);
      if (!map) return;
      this.selectedWorldNodeId.set(map.nodeId);
      this.tab.set('mundo');
      return;
    }
    const node = view.nodes.find(item => item.id === target.nodeId);
    if (node) this.openPanel({ kind: 'node-edit', node });
  }

  nodeIcon(node: NodeEditorState): string {
    if (node.startNode) return 'play_circle';
    return node.terminal ? 'stop_circle' : 'radio_button_unchecked';
  }

  // ─── Acciones ────────────────────────────────────────────────────────────────────────────────────────────────────

  /** `true` si la versión admite cambios; si no, explica por qué (la hoja ni se abre). */
  private ensureEditable(): boolean {
    const reason = this.lockReason();
    if (reason) this.notify.warning(reason);
    return !reason;
  }

  private async confirmDanger(title: string, message: string): Promise<boolean> {
    if (!this.ensureEditable()) return false;
    return this.confirmOnce({ title, message, confirmLabel: 'Eliminar', tone: 'danger' });
  }

  /** Una sola confirmación a la vez: un segundo gesto no abre otra ni repite la acción. */
  private async confirmOnce(options: UiConfirmOptions): Promise<boolean> {
    if (this.busy() || this.confirming) return false;
    this.confirming = true;
    try {
      return await this.dialog.confirm(options);
    } finally {
      this.confirming = false;
    }
  }

  /** Ejecuta una acción del editor y le dice al usuario si funcionó o por qué falló. */
  private runAction(call: EditorCall, success: string, fallback: string, onSuccess?: (view: CaseEditorView) => void): void {
    this.execute(call, this.editor()?.revision, success, fallback, onSuccess);
  }

  private execute(
    call: EditorCall,
    revision: number | undefined,
    success: string,
    fallback: string,
    onSuccess?: (view: CaseEditorView) => void,
  ): void {
    this.busy.set(true);
    call(revision).subscribe({
      next: view => {
        this.refresh(view);
        onSuccess?.(view);
        this.notify.success(success);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const conflict = revisionConflictOf(err);
        if (conflict) {
          void this.resolveConflict(conflict, call, success, fallback, onSuccess);
          return;
        }
        const text = apiErrorMessage(err, fallback);
        if (text) this.notify.error(text);
      },
    });
  }

  /**
   * El 409 de la revisión (RNF-08, REGLA-011): otra sesión editó el caso. Se muestra la comparación y se elige:
   * «Recargar» descarta lo propio y carga la versión vigente; «Reintentar» aplica lo propio sobre ella. Cerrar sin
   * elegir deja la pantalla y el formulario como estaban.
   */
  private async resolveConflict(
    conflict: RevisionConflict,
    call: EditorCall,
    success: string,
    fallback: string,
    onSuccess?: (view: CaseEditorView) => void,
  ): Promise<void> {
    const mine = this.editor();
    const ref = this.dialog.open<RevisionConflictAnswer, RevisionConflictDialogData, RevisionConflictDialogComponent>(
      RevisionConflictDialogComponent,
      {
        size: 'md',
        data: {
          mineRevision: mine?.revision ?? null,
          currentRevision: conflict.revision,
          changes: mine ? describeEditorChanges(mine, conflict.current) : [],
        },
      },
    );
    const answer = await firstValueFrom(ref.closed, { defaultValue: undefined });
    if (answer === 'reload') {
      this.closePanel();
      if (conflict.current) {
        this.adopt(conflict.current, true);
        this.notify.info('Se cargó la versión más reciente del caso.');
      } else {
        this.load();
      }
    } else if (answer === 'retry') {
      if (conflict.current) this.adopt(conflict.current);
      this.execute(call, conflict.revision, success, fallback, onSuccess);
    }
  }

  private refresh(model: CaseEditorView): void {
    this.adopt(model);
    this.busy.set(false);
    this.closePanel();
  }
}
