// Sin `vi.mock`: el editor de mundo (Konva) y la vista previa (Phaser, que inicializa un canvas WebGL al cargarse y
// jsdom no soporta) van en bloques `@defer`: su módulo solo se evalúa si la pestaña se abre, y estas pruebas no la
// abren. Un archivo con `vi.mock` no admite funciones `async` en este constructor.
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import { AuthoringApi } from '../../core/api/authoring.api';
import { AuthService } from '../../core/auth/auth.service';
import { CaseEditorView, NodeEditorState } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { CaseEditorSheetComponent } from './case-editor-sheet.component';
import { CaseEditorComponent } from './case-editor.component';
import { RevisionConflictDialogComponent } from './revision-conflict-dialog.component';

const CASE_ID = 7;

const node = (id: number, key: string, title: string, over: Partial<NodeEditorState> = {}): NodeEditorState => ({
  id, key, title, narrative: `Narrativa de ${title}`, supportResources: [], requiredTools: [],
  sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
  positionX: null, positionY: null, decisionPrompt: '', displayOrder: 0, ...over,
});

const CHECKLIST_ITEMS = [
  { code: 'contentOriginal', label: 'Contenido original — sin copiar personajes, mapas ni narrativa comercial.', required: true, fulfilled: true, draft: false },
  { code: 'ethicsReviewed', label: 'Revisión ética — caso validado por experto o comité.', required: true, fulfilled: false, draft: false },
  { code: 'safetyProtocols', label: 'Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.', required: true, fulfilled: true, draft: false },
  { code: 'noStigmatizing', label: 'Sin lenguaje estigmatizante ni estereotipos clínicos.', required: true, fulfilled: false, draft: false },
  { code: 'triggerWarnings', label: 'Advertencias de contenido sensible configuradas en nodos.', required: true, fulfilled: true, draft: false },
  { code: 'accessibilityOk', label: 'Accesibilidad — fallback accesible y controles táctiles probados.', required: true, fulfilled: true, draft: false },
  { code: 'scopeEducational', label: 'El caso declara su alcance educativo: es un ejercicio formativo, no un diagnóstico.', required: false, fulfilled: false, draft: true },
];

function editorView(over: Partial<CaseEditorView> = {}): CaseEditorView {
  return {
    caseVersionId: CASE_ID,
    revision: 3,
    title: 'Caso de duelo',
    semanticVersion: '1.2.0',
    status: 'DRAFT',
    context: 'Una mujer llega a urgencias.',
    learningObjectives: ['Validar sin juzgar.'],
    nodes: [node(1, 'inicio', 'Inicio del caso', { startNode: true }), node(2, 'cierre', 'Cierre', { terminal: true, displayOrder: 1 })],
    decisions: [],
    maps: [{ id: 11, key: 'sala', title: 'Sala de espera', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430, nodeId: 1, nodeKey: 'inicio' }],
    objects: [{
      id: 21, key: 'consultante', label: 'Consultante', type: 'PERSON', x: 200, y: 300, width: 48, height: 48, colorHex: '#4FA3A5',
      icon: 'psychology', shortCode: 'CON', collision: false, visible: true, interactionPrompt: 'Hablar', interactionText: '',
      decisionOptionId: null, toolCode: null, mapId: 11,
    }],
    tools: [{ id: 31, code: 'PAP', label: 'Primeros auxilios psicológicos', icon: 'psychology', category: 'clinical', description: 'Guía breve', active: true }],
    hints: [{ id: 41, mapId: 11, order: 1, text: 'Mira cómo respira.' }],
    characters: [{ id: 51, key: 'marta', displayName: 'Marta', roleLabel: 'Enfermera', portraitKey: '', showInBrief: true, displayOrder: 0 }],
    rubrics: [],
    checklistCompletion: 67,
    publishable: false,
    checklist: { items: CHECKLIST_ITEMS, contentReview: { fulfilled: false }, strict: false },
    ...over,
  } as unknown as CaseEditorView;
}

const COMPLETE_CHECKLIST = {
  items: CHECKLIST_ITEMS.map(item => ({ ...item, fulfilled: item.required ? true : item.fulfilled })),
  contentReview: { fulfilled: false },
  strict: false,
};

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('editor de casos (F8-1)', () => {
  let fixture: ComponentFixture<CaseEditorComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let caseChanges: Subject<number>;
  let notify: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { sheet: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
  let role: ReturnType<typeof signal<string>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const host = () => fixture.nativeElement as HTMLElement;
  const component = () => fixture.componentInstance;
  const buttonLabelled = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label);
  const tab = (name: string) => [...host().querySelectorAll<HTMLElement>('[role="tab"]')].find(el => text(el) === name);
  // Una vuelta de macrotarea: las confirmaciones encadenan varias promesas y `whenStable` no las espera todas.
  const settle = async () => {
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve));
    fixture.detectChanges();
  };

  async function render(options: { view?: CaseEditorView | Observable<CaseEditorView>; role?: string; stable?: boolean } = {}) {
    const view = options.view ?? editorView();
    caseChanges = new Subject<number>();
    api = {
      caseEditor: vi.fn(() => (view instanceof Observable ? view : of(view))),
      createNode: vi.fn(() => of(editorView({ revision: 4 }))),
      updateNode: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteNode: vi.fn(() => of(editorView({ revision: 4 }))),
      createDecision: vi.fn(() => of(editorView({ revision: 4 }))),
      updateDecision: vi.fn(() => of(editorView({ revision: 4 }))),
      createMap: vi.fn(() => of(editorView({ revision: 4 }))),
      updateMap: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteMap: vi.fn(() => of(editorView({ revision: 4 }))),
      createObject: vi.fn(() => of(editorView({ revision: 4 }))),
      updateObject: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteObject: vi.fn(() => of(editorView({ revision: 4 }))),
      createTool: vi.fn(() => of(editorView({ revision: 4 }))),
      updateTool: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteTool: vi.fn(() => of(editorView({ revision: 4 }))),
      updateChecklist: vi.fn(() => of(editorView({ revision: 4 }))),
      createHint: vi.fn(() => of(editorView({ revision: 4 }))),
      updateHint: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteHint: vi.fn(() => of(editorView({ revision: 4 }))),
      createCharacter: vi.fn(() => of(editorView({ revision: 4 }))),
      updateCharacter: vi.fn(() => of(editorView({ revision: 4 }))),
      deleteCharacter: vi.fn(() => of(editorView({ revision: 4 }))),
      updateBrief: vi.fn(() => of(editorView({ revision: 4 }))),
      reorderNodes: vi.fn(() => of(editorView({ revision: 4 }))),
      cloneCaseVersion: vi.fn(() => of(editorView({ revision: 1 }))),
      lifecycle: vi.fn(() => of({ caseVersionId: CASE_ID, state: 'DRAFT', allowedTransitions: ['submit', 'archive'] })),
      validateCase: vi.fn(() => of({ issues: [], canPublish: true })),
      // Como la real: una transición aplicada avisa a quien tenga el caso abierto (AuthoringApi.caseChanges).
      transitionCase: vi.fn(() => { caseChanges.next(CASE_ID); return of({ caseVersionId: CASE_ID, state: 'IN_REVIEW', allowedTransitions: [] }); }),
      caseChanges: caseChanges as unknown as ReturnType<typeof vi.fn>,
    };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    dialog = {
      sheet: vi.fn(() => ({ close: vi.fn(), closed: new Subject<void>() })),
      confirm: vi.fn(() => Promise.resolve(true)),
      open: vi.fn(() => ({ closed: of('reload') })),
    };
    role = signal(options.role ?? 'ADMIN');
    TestBed.configureTestingModule({
      imports: [CaseEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthoringApi, useValue: api },
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
        { provide: AuthService, useValue: { currentUser: signal({ role: role() }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_ID) }) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CaseEditorComponent);
    if (options.stable === false) fixture.detectChanges();
    else await settle();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estructura y estados', () => {
    it('un solo h1 con el título del caso, la región de estado siempre presente y las doce pestañas', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Caso de duelo');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect([...host().querySelectorAll('[role="tab"]')].map(text)).toEqual([
        'Grafo DAG', 'Escenas', 'Mapas', 'Objetos', 'Herramientas', 'Ayudas', 'Ficha', 'Rúbricas', 'Checklist ético', 'Revisión', 'Mundo',
        'Vista previa',
      ]);
    });

    it('el estado del caso va en una insignia con su etiqueta humana y la versión a la vista', async () => {
      await render();
      expect(text(host().querySelector('ui-badge'))).toBe('Borrador');
      expect(text(host())).toContain('Versión 1.2.0');
    });

    it('mientras carga: esqueleto, el estado leído y un h1 que nombra la pantalla', async () => {
      vi.useFakeTimers();
      await render({ view: new Subject<CaseEditorView>(), stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando el editor…');
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Editor de caso');
    });

    it('si la carga falla: UN error con «Reintentar» que vuelve a pedir el editor', async () => {
      let calls = 0;
      await render({ view: new Observable<CaseEditorView>(subscriber => {
        calls += 1;
        if (calls === 1) subscriber.error(new HttpErrorResponse({ status: 500 }));
        else { subscriber.next(editorView()); subscriber.complete(); }
      }) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(host().querySelector('[role="tab"]')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await settle();

      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(text(host().querySelector('h1'))).toBe('Caso de duelo');
    });

    it('un caso ajeno (404 del servidor) se dice como «no encontrado», no como un fallo cualquiera', async () => {
      await render({ view: throwError(() => new HttpErrorResponse({ status: 404 })) });
      expect(text(host().querySelector('ui-error-state'))).toContain('No lo encontramos');
    });
  });

  // req: RF-05, CU-01, REGLA-011
  describe('cabecera: clonar; la publicación es la del panel «Revisión» (decisión del usuario, 2026-10-16)', () => {
    it('nadie ve «Publicar» en la cabecera, tampoco el administrador con la lista completa: se publica por el camino formal', async () => {
      await render({ view: editorView({ checklistCompletion: 100, publishable: true, checklist: COMPLETE_CHECKLIST as never }) });
      expect(buttonLabelled('Publicar')).toBeUndefined();
      expect(buttonLabelled('Clonar versión')).toBeDefined();
    });

    it('el docente tampoco, y conserva «Clonar versión»', async () => {
      await render({ role: 'PROFESOR' });
      expect(buttonLabelled('Publicar')).toBeUndefined();
      expect(buttonLabelled('Clonar versión')).toBeDefined();
    });

    it('enviar a revisión pide confirmación y no llama al servidor hasta confirmar; envía la revisión vigente', async () => {
      await render();
      tab('Revisión')!.click();
      await settle();
      let answer!: (value: boolean) => void;
      dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

      buttonLabelled('Enviar a revisión')!.click();
      await settle();
      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enviar a revisión', confirmLabel: 'Enviar' }));
      expect(api['transitionCase']).not.toHaveBeenCalled();

      answer(true);
      await settle();
      expect(api['transitionCase']).toHaveBeenCalledWith(CASE_ID, { action: 'submit' }, 3);
      expect(notify['success']).toHaveBeenCalledWith('El caso se envió a revisión.');
    });

    it('si se cancela la confirmación no se envía', async () => {
      await render();
      tab('Revisión')!.click();
      await settle();
      dialog.confirm.mockResolvedValue(false);

      buttonLabelled('Enviar a revisión')!.click();
      await settle();

      expect(api['transitionCase']).not.toHaveBeenCalled();
    });

    it('la lista de publicación dice a dónde ir cuando está completa: se envía a revisión desde «Revisión»', async () => {
      await render({ view: editorView({ checklistCompletion: 100, publishable: true, checklist: COMPLETE_CHECKLIST as never }) });
      tab('Checklist ético')!.click();
      await settle();

      expect(text(host().querySelector('.ce-lead'))).toContain('desde la pestaña «Revisión»');
    });
  });

  // req: RNF-08, REGLA-011, SIEP-RN-05
  describe('revisión del caso en cada acción y conflicto 409', () => {
    const conflict = (current: CaseEditorView) => throwError(() => new HttpErrorResponse({
      status: 409,
      error: { success: false, code: 'REVISION_CONFLICT', message: 'Este caso fue modificado en otra sesión.', revision: current.revision, current },
    }));

    it('cada guardado manda la revisión que la pantalla tiene y adopta la que devuelve el servidor', async () => {
      await render();
      component().openPanel({ kind: 'node-create' });
      component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

      component().saveNode(CASE_ID);
      await settle();

      expect(api['createNode']).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({ nodeKey: 'nuevo' }), 3);
      expect(component().editor()!.revision).toBe(4);
    });

    it('un 409 abre la comparación con lo que cambió; «Reintentar» reenvía con la revisión vigente', async () => {
      await render();
      const current = editorView({ revision: 9, nodes: [...editorView().nodes, node(3, 'extra', 'Extra')] });
      api['createNode'].mockReturnValueOnce(conflict(current));
      dialog.open.mockReturnValue({ closed: of('retry') });
      component().openPanel({ kind: 'node-create' });
      component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

      component().saveNode(CASE_ID);
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(RevisionConflictDialogComponent, expect.objectContaining({
        data: expect.objectContaining({ mineRevision: 3, currentRevision: 9, changes: ['Nodos: 1 nuevo.'] }),
      }));
      expect(api['createNode']).toHaveBeenCalledTimes(2);
      expect(api['createNode']).toHaveBeenLastCalledWith(CASE_ID, expect.objectContaining({ nodeKey: 'nuevo' }), 9);
      expect(notify['error']).not.toHaveBeenCalled();
    });

    it('«Recargar» adopta el editor vigente y descarta lo que se iba a guardar', async () => {
      await render();
      const current = editorView({ revision: 9, title: 'Caso de duelo (revisado)' });
      api['createNode'].mockReturnValueOnce(conflict(current));
      dialog.open.mockReturnValue({ closed: of('reload') });
      component().openPanel({ kind: 'node-create' });
      component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

      component().saveNode(CASE_ID);
      await settle();

      expect(api['createNode']).toHaveBeenCalledTimes(1);
      expect(component().editor()!.revision).toBe(9);
      expect(component().panel()).toBeNull();
      expect(notify['info']).toHaveBeenCalledWith('Se cargó la versión más reciente del caso.');
    });

    it('cerrar la comparación sin elegir deja la pantalla y el formulario como estaban', async () => {
      await render();
      api['createNode'].mockReturnValueOnce(conflict(editorView({ revision: 9 })));
      dialog.open.mockReturnValue({ closed: of(undefined) });
      component().openPanel({ kind: 'node-create' });
      component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

      component().saveNode(CASE_ID);
      await settle();

      expect(api['createNode']).toHaveBeenCalledTimes(1);
      expect(component().editor()!.revision).toBe(3);
      expect(component().panel()).toEqual({ kind: 'node-create' });
      expect(component().busy()).toBe(false);
    });
  });

  // req: RF-05, CU-01, RN-01
  describe('lista de publicación (checklist) real', () => {
    const openChecklist = async () => {
      tab('Checklist ético')!.click();
      await settle();
    };
    const checkbox = (code: string) => host().querySelector<HTMLInputElement>(`input[type="checkbox"][data-code="${code}"]`);

    it('las casillas parten de lo que guardó el servidor, no de «todo sin marcar»', async () => {
      await render();
      await openChecklist();

      expect(checkbox('contentOriginal')!.checked).toBe(true);
      expect(checkbox('ethicsReviewed')!.checked).toBe(false);
      expect(checkbox('safetyProtocols')!.checked).toBe(true);
      expect(host().querySelectorAll('input[type="checkbox"][data-code]')).toHaveLength(7);
    });

    it('guardar sin tocar nada reenvía lo ya cumplido (antes lo borraba todo)', async () => {
      await render();
      await openChecklist();

      component().saveChecklist(CASE_ID);
      await settle();

      expect(api['updateChecklist']).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({
        contentOriginal: true, ethicsReviewed: false, safetyProtocols: true, noStigmatizing: false,
        triggerWarnings: true, accessibilityOk: true, scopeEducational: false,
      }), 3);
    });

    it('el ítem de alcance educativo se marca como texto en borrador y es opcional', async () => {
      await render();
      await openChecklist();

      const row = checkbox('scopeEducational')!.closest('li')!;
      expect(text(row)).toContain('Texto en borrador');
      expect(text(row)).toContain('Opcional');
      expect(text(checkbox('contentOriginal')!.closest('li'))).toContain('Obligatorio');
    });

    it('la revisión de contenido por Psicología es solo lectura: sin casilla, con lo que registró el administrador', async () => {
      await render({ view: editorView({ checklist: {
        ...COMPLETE_CHECKLIST,
        contentReview: { fulfilled: true, reviewer: 'Dra. Rivas', reviewedOn: '2026-10-01', reference: 'ACTA-12' },
      } as never }) });
      await openChecklist();

      const review = host().querySelector('.ce-review')!;
      expect(review.querySelector('input')).toBeNull();
      expect(text(review)).toContain('Dra. Rivas');
      expect(text(review)).toContain('ACTA-12');
    });

    it('sin constancia, la revisión de contenido dice que está pendiente y quién la registra', async () => {
      await render();
      await openChecklist();

      expect(text(host().querySelector('.ce-review'))).toContain('Pendiente');
    });
  });

  // req: RF-12, RF-13, CU-05
  describe('revisión del caso (F10-6)', () => {
    const hasButtonWith = (fragment: string) => [...host().querySelectorAll('button')].some(button => text(button).includes(fragment));

    it('la pestaña «Revisión» muestra el estado de la versión y lo que el servidor permite hacer', async () => {
      await render();
      tab('Revisión')!.click();
      await settle();

      expect(api['lifecycle']).toHaveBeenCalledWith(CASE_ID);
      expect(api['validateCase']).toHaveBeenCalledWith(CASE_ID);
      expect(host().querySelector('app-case-review-panel')).not.toBeNull();
      expect(buttonLabelled('Enviar a revisión')).toBeDefined();
    });

    it('enviar a revisión desde la pestaña manda la revisión del editor y el editor se actualiza EN SILENCIO (sin esqueleto)', async () => {
      await render();
      tab('Revisión')!.click();
      await settle();

      buttonLabelled('Enviar a revisión')!.click();
      await settle();

      expect(api['transitionCase']).toHaveBeenCalledWith(CASE_ID, { action: 'submit' }, 3);
      expect(api['caseEditor']).toHaveBeenCalledTimes(2);
      expect(host().querySelector('.ce-loading')).toBeNull();
      expect(host().querySelector('app-case-review-panel')).not.toBeNull();
    });

    it('el editor se entera por el servicio de cualquier cambio del caso (aunque quien lo pidió ya no esté) y relee solo el suyo', async () => {
      await render();

      caseChanges.next(999);
      await settle();
      expect(api['caseEditor']).toHaveBeenCalledTimes(1);

      caseChanges.next(CASE_ID);
      await settle();
      expect(api['caseEditor']).toHaveBeenCalledTimes(2);
      expect(host().querySelector('.ce-loading')).toBeNull();
    });

    it('una transición no descarta las casillas del checklist sin guardar', async () => {
      await render();
      tab('Checklist ético')!.click();
      await settle();
      const box = () => host().querySelector<HTMLInputElement>('input[data-code="ethicsReviewed"]')!;
      expect(box().checked).toBe(false);
      box().click();
      await settle();
      expect(box().checked).toBe(true);

      tab('Revisión')!.click();
      await settle();
      buttonLabelled('Enviar a revisión')!.click();
      await settle();
      tab('Checklist ético')!.click();
      await settle();

      expect(api['caseEditor']).toHaveBeenCalledTimes(2);
      expect(box().checked, 'la casilla que se marcó sigue marcada').toBe(true);
    });

    it('en revisión el candado lo explica sin mandar a clonar (el panel dice lo contrario)', async () => {
      await render({ view: editorView({ status: 'IN_REVIEW' }) });

      const lock = text(host().querySelector('p.ce-lock'));
      expect(lock).toContain('en revisión');
      expect(lock).not.toContain('clónala');
    });

    it('un hallazgo de una escena abre la hoja de edición de ese nodo', async () => {
      await render();
      component().openReviewIssue({ nodeId: 1 });

      expect(dialog.sheet).toHaveBeenCalledWith(CaseEditorSheetComponent, expect.objectContaining({ side: 'end' }));
      expect(component().panel()).toMatchObject({ kind: 'node-edit', node: expect.objectContaining({ id: 1 }) });
    });

    it('un hallazgo de un mapa lleva al editor de mundo de su sala', async () => {
      await render();
      component().openReviewIssue({ nodeId: 1, mapId: 11 });

      expect(component().selectedWorldNodeId()).toBe(1);
      expect(component().tab()).toBe('mundo');
    });

    it('un hallazgo de algo que ya no existe no abre nada y lo dice', async () => {
      await render();
      component().openReviewIssue({ mapId: 999 });
      component().openReviewIssue({ nodeId: 999 });

      expect(dialog.sheet).not.toHaveBeenCalled();
      expect(component().selectedWorldNodeId()).toBeNull();
      expect(notify['info']).toHaveBeenCalledTimes(2);
      expect(notify['info']).toHaveBeenCalledWith('Ese elemento ya no está en el caso: pulsa «Revisar de nuevo».');
    });

    it('en una versión que no es borrador los hallazgos se leen pero no ofrecen ir a la escena', async () => {
      await render({ view: editorView({ status: 'IN_REVIEW' }) });
      api['validateCase'].mockReturnValue(of({
        canPublish: false,
        issues: [{ code: 'WORLD.NODE_WITHOUT_MAP', severity: 'error', message: 'La escena «Inicio del caso» no tiene mapa.', nodeId: 1 }],
      }));
      api['lifecycle'].mockReturnValue(of({ caseVersionId: CASE_ID, state: 'IN_REVIEW', allowedTransitions: [] }));
      tab('Revisión')!.click();
      await settle();

      expect(text(host())).toContain('La escena «Inicio del caso» no tiene mapa.');
      expect(hasButtonWith('Ir a la escena')).toBe(false);
    });
  });

  // req: RNF-08, REGLA-005
  describe('clonar la versión', () => {
    it('abre la copia: la pantalla y la URL pasan a la versión nueva, sin dejar el mundo del nodo anterior', async () => {
      await render();
      component().selectedWorldNodeId.set(1);
      api['cloneCaseVersion'].mockReturnValue(of(editorView({ caseVersionId: 8, revision: 1, title: 'Caso de duelo' })));

      buttonLabelled('Clonar versión')!.click();
      await settle();

      expect(api['cloneCaseVersion']).toHaveBeenCalledWith(CASE_ID);
      expect(component().editor()!.caseVersionId).toBe(8);
      expect(component().selectedWorldNodeId()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/portal/casos', 8, 'editor'], { replaceUrl: true });
      expect(notify['success']).toHaveBeenCalledWith('Se creó una nueva versión del caso.');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('accesibilidad de los botones', () => {
    it('todo botón del editor tiene nombre accesible, en cada pestaña de datos', async () => {
      await render();
      for (const name of ['Grafo DAG', 'Escenas', 'Mapas', 'Objetos', 'Herramientas', 'Ayudas', 'Ficha', 'Rúbricas', 'Checklist ético', 'Revisión']) {
        tab(name)!.click();
        await settle();
      }
      const nameless = [...host().querySelectorAll<HTMLElement>('button')].filter(button =>
        !text(button) && !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby'));
      expect(nameless.map(button => button.outerHTML)).toEqual([]);
    });

    it('editar y eliminar de cada tarjeta se nombran con lo que editan', async () => {
      await render();
      // El panel de una pestaña se desmonta al cambiar de pestaña: se leen los nombres de cada una al abrirla.
      const names: Array<string | null> = [];
      for (const name of ['Mapas', 'Objetos', 'Herramientas']) {
        tab(name)!.click();
        await settle();
        names.push(...[...host().querySelectorAll<HTMLElement>('button[aria-label]')].map(button => button.getAttribute('aria-label')));
      }
      expect(names).toEqual(expect.arrayContaining([
        'Editar mapa Sala de espera', 'Eliminar mapa Sala de espera',
        'Editar objeto Consultante', 'Eliminar objeto Consultante',
        'Editar herramienta Primeros auxilios psicológicos', 'Eliminar herramienta Primeros auxilios psicológicos',
      ]));
    });
  });

  // req: RF-05, RNF-04, BLOQUE-H
  describe('pestañas de datos: vacíos con acción, «Nuevo objeto» y títulos de nodo (F8-2)', () => {
    const emptyState = () => host().querySelector('ui-empty-state');
    const emptyAction = () => emptyState()?.querySelector<HTMLButtonElement>('button');
    const openTab = async (name: string) => {
      tab(name)!.click();
      await settle();
    };
    const reasonOf = (button: HTMLElement | undefined) => text(button?.querySelector('span[hidden]'));

    it('Mapas sin mapas: dice qué falta y ofrece «Crear el primer mapa», que abre la hoja', async () => {
      await render({ view: editorView({ maps: [], objects: [] }) });
      await openTab('Mapas');

      expect(text(emptyState()!)).toContain('Este caso aún no tiene mapas');
      expect(text(emptyAction())).toBe('Crear el primer mapa');
      emptyAction()!.click();
      expect(component().panel()).toEqual({ kind: 'map-create' });
    });

    it('Mapas sin mapas ni nodos: no se puede crear un mapa; la acción lleva al grafo', async () => {
      await render({ view: editorView({ maps: [], objects: [], nodes: [] }) });
      await openTab('Mapas');

      expect(buttonLabelled('Nuevo mapa')!.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(buttonLabelled('Nuevo mapa'))).toContain('Crea un nodo primero');
      expect(text(emptyAction())).toBe('Ir al grafo');
      emptyAction()!.click();
      expect(component().tab()).toBe('grafo');
    });

    it('Objetos sin mapas: «Nuevo objeto» está a la vista, deshabilitado con el motivo «Crea un mapa primero.»', async () => {
      await render({ view: editorView({ maps: [], objects: [] }) });
      await openTab('Objetos');

      const create = buttonLabelled('Nuevo objeto')!;
      expect(create).toBeDefined();
      expect(create.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(create)).toBe('Crea un mapa primero.');
      expect(text(emptyAction())).toBe('Ir a Mapas');
      emptyAction()!.click();
      expect(component().tab()).toBe('mapas');
    });

    it('Objetos con mapas: «Nuevo objeto» abre la hoja con el primer mapa elegido', async () => {
      await render({ view: editorView({ objects: [] }) });
      await openTab('Objetos');

      expect(text(emptyAction())).toBe('Crear el primer objeto');
      buttonLabelled('Nuevo objeto')!.click();

      expect(component().panel()).toEqual({ kind: 'object-create', mapId: 11 });
      expect(component().objectForm!.get('_mapId')!.value).toBe(11);
    });

    it('Herramientas sin herramientas: «Crear la primera herramienta» abre la hoja', async () => {
      await render({ view: editorView({ tools: [] }) });
      await openTab('Herramientas');

      expect(text(emptyState()!)).toContain('Este caso aún no tiene herramientas');
      expect(text(emptyAction())).toBe('Crear la primera herramienta');
      emptyAction()!.click();
      expect(component().panel()).toEqual({ kind: 'tool-create' });
    });

    it('Rúbricas sin rúbricas: lo dice y la acción lleva a la pantalla de Rúbricas', async () => {
      await render({ view: editorView({ rubrics: [] }) });
      await openTab('Rúbricas');

      expect(text(emptyState()!)).toContain('Este caso no tiene rúbricas asignadas');
      expect(text(emptyAction())).toBe('Ir a Rúbricas');
      emptyAction()!.click();
      expect(navigate).toHaveBeenCalledWith(['/portal/rubricas']);
    });

    it('las tarjetas nombran el nodo y el mapa por su título, no por su clave', async () => {
      await render();
      await openTab('Mapas');
      expect(text(host().querySelector('.ce-card__meta'))).toContain('nodo Inicio del caso');
      expect(text(host().querySelector('.ce-card__meta'))).not.toContain('inicio ');

      await openTab('Objetos');
      expect(text(host().querySelector('.ce-card__meta'))).toContain('en «Sala de espera»');
    });

    it('en una versión que no es borrador los vacíos no ofrecen crear (la acción llevaría a un 400)', async () => {
      await render({ view: editorView({ status: 'PUBLISHED', maps: [], tools: [] }) });
      await openTab('Mapas');
      expect(emptyAction()).toBeNull();

      await openTab('Herramientas');
      expect(emptyAction()).toBeNull();
    });
  });

  // req: RF-06, RF-08, RF-09, RF-10, RF-11, RF-07, RF-16, CU-04
  describe('escenas, ayudas, ficha y textos de la decisión (F10-3)', () => {
    const openTab = async (name: string) => {
      tab(name)!.click();
      await settle();
    };
    const byLabel = (label: string) => host().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const decisionEdge = {
      id: 40, optionKey: 'cerrar', sourceNodeId: 1, sourceKey: 'inicio', targetNodeId: 2, targetKey: 'cierre', text: 'Cerrar el caso',
      classification: 'ADEQUATE' as const, prohibitedConduct: false, prohibitionReason: null, scoreDelta: 10, stressDelta: 0,
      prohibitedPenalty: 0, immediateFeedback: 'Bien.', consequenceText: 'Ella respira más tranquila.',
      theoryBasis: 'Rogers (1957).', feedbackText: 'Validar sostiene la alianza.',
    };

    describe('Escenas', () => {
      it('mover una escena pide el orden de TODAS con la revisión vigente, avisa y adopta la vista nueva', async () => {
        await render();
        await openTab('Escenas');
        expect([...host().querySelectorAll('.so-title')].map(text)).toEqual(['Inicio del caso', 'Cierre']);

        byLabel('Bajar «Inicio del caso»').click();
        await settle();

        expect(api['reorderNodes']).toHaveBeenCalledWith(CASE_ID, [2, 1], 3);
        expect(notify['success']).toHaveBeenCalledWith('Orden de las escenas actualizado.');
        expect(component().editor()!.revision).toBe(4);
      });

      it('un fallo del servidor se dice con su mensaje y el orden no cambia', async () => {
        await render();
        await openTab('Escenas');
        api['reorderNodes'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({
          status: 400, error: { message: 'El orden debe incluir cada nodo del caso exactamente una vez.' },
        })));

        byLabel('Bajar «Inicio del caso»').click();
        await settle();

        expect(notify['error']).toHaveBeenCalledWith('El orden debe incluir cada nodo del caso exactamente una vez.');
        expect(component().editor()!.revision).toBe(3);
        expect(component().busy()).toBe(false);
      });

      it('«Editar» una escena abre la hoja de ese nodo', async () => {
        await render();
        await openTab('Escenas');

        byLabel('Editar «Cierre»').click();

        expect(component().panel()).toMatchObject({ kind: 'node-edit', node: expect.objectContaining({ id: 2 }) });
      });

      it('en una versión que no es borrador no se mueve nada y se dice por qué', async () => {
        await render({ view: editorView({ status: 'PUBLISHED' }) });
        await openTab('Escenas');

        const down = byLabel('Bajar «Inicio del caso»');
        expect(down.getAttribute('aria-disabled')).toBe('true');
        expect(text(down.querySelector('span[hidden]'))).toContain('no es un borrador');
        down.click();
        expect(api['reorderNodes']).not.toHaveBeenCalled();
      });
    });

    describe('Ayudas', () => {
      it('«Agregar ayuda» abre la hoja de esa sala y guardar la crea en ella con la revisión vigente', async () => {
        await render();
        await openTab('Ayudas');

        buttonLabelled('Agregar ayuda a «Sala de espera»')!.click();
        expect(component().panel()).toEqual({ kind: 'hint-create', mapId: 11 });
        component().hintForm!.patchValue({ text: '  Pregunta por el sueño.  ' });
        component().saveHint(CASE_ID);
        await settle();

        expect(api['createHint']).toHaveBeenCalledWith(CASE_ID, 11, { text: 'Pregunta por el sueño.' }, 3);
        expect(notify['success']).toHaveBeenCalledWith('Ayuda guardada.');
        expect(component().panel()).toBeNull();
      });

      it('con un lugar escrito lo manda como hintOrder; vacío no lo manda (el servidor la pone al final)', async () => {
        await render();
        component().openPanel({ kind: 'hint-create', mapId: 11 });
        component().hintForm!.patchValue({ text: 'Primera.', hintOrder: 1 });
        component().saveHint(CASE_ID);
        await settle();

        expect(api['createHint']).toHaveBeenCalledWith(CASE_ID, 11, { text: 'Primera.', hintOrder: 1 }, 3);
      });

      it('editar parte del texto y del lugar de la ayuda y guarda sobre ella', async () => {
        await render();
        const existing = component().editor()!.hints[0];

        component().openPanel({ kind: 'hint-edit', hint: existing });
        expect(component().hintForm!.value).toEqual({ text: 'Mira cómo respira.', hintOrder: 1 });
        component().hintForm!.patchValue({ text: 'Mira su respiración.' });
        component().saveHint(CASE_ID);
        await settle();

        expect(api['updateHint']).toHaveBeenCalledWith(CASE_ID, 41, { text: 'Mira su respiración.', hintOrder: 1 }, 3);
        expect(notify['success']).toHaveBeenCalledWith('Ayuda guardada.');
      });

      it('una ayuda sin texto no se envía: marca el campo y deja la hoja abierta', async () => {
        await render();
        component().openPanel({ kind: 'hint-create', mapId: 11 });

        component().save();

        expect(api['createHint']).not.toHaveBeenCalled();
        expect(component().hintForm!.get('text')!.touched).toBe(true);
        expect(component().panel()).toEqual({ kind: 'hint-create', mapId: 11 });
      });

      it('una ayuda de solo espacios no se envía: marca el campo (antes el servidor respondía 400 «No puede estar vacío»)', async () => {
        await render();
        component().openPanel({ kind: 'hint-create', mapId: 11 });
        component().hintForm!.patchValue({ text: '    ' });

        component().save();

        expect(api['createHint']).not.toHaveBeenCalled();
        expect(component().hintForm!.get('text')!.touched).toBe(true);
        expect(component().panel()).toEqual({ kind: 'hint-create', mapId: 11 });
      });

      it('eliminar pide confirmar nombrando la ayuda y solo entonces llama al servidor', async () => {
        await render();
        let answer!: (value: boolean) => void;
        dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

        void component().confirmDeleteHint(CASE_ID, component().editor()!.hints[0]);
        expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Eliminar ayuda', message: expect.stringContaining('Mira cómo respira.'), tone: 'danger', confirmLabel: 'Eliminar',
        }));
        expect(api['deleteHint']).not.toHaveBeenCalled();

        answer(true);
        await settle();
        expect(api['deleteHint']).toHaveBeenCalledWith(CASE_ID, 41, 3);
        expect(notify['success']).toHaveBeenCalledWith('Ayuda eliminada.');
      });

      it('«Ir a Mapas» de la pestaña sin salas cambia de pestaña', async () => {
        await render({ view: editorView({ maps: [], objects: [], hints: [] }) });
        await openTab('Ayudas');

        buttonLabelled('Ir a Mapas')!.click();
        await settle();

        expect(component().tab()).toBe('mapas');
      });
    });

    // req: RF-16, CU-04, RNF-08 (revisión de F10: una pestaña inactiva se destruye y lo escrito no puede morir con ella)
    describe('Ficha: el formulario es de la pantalla', () => {
      const brief = () => host().querySelector<HTMLTextAreaElement>('app-case-brief-editor textarea')!;
      const typeBrief = (value: string) => {
        const target = brief();
        target.value = value;
        target.dispatchEvent(new Event('input'));
      };
      const conflictWith = (current: CaseEditorView) => throwError(() => new HttpErrorResponse({
        status: 409,
        error: { success: false, code: 'REVISION_CONFLICT', message: 'Este caso fue modificado en otra sesión.', revision: current.revision, current },
      }));

      it('lo escrito sin guardar sobrevive a cambiar de pestaña y volver', async () => {
        await render();
        await openTab('Ficha');
        typeBrief('Lo que estoy escribiendo.');

        await openTab('Escenas');
        await openTab('Ficha');

        expect(brief().value).toBe('Lo que estoy escribiendo.');
      });

      it('un guardado de otra cosa (que adopta la vista nueva) no pisa la ficha sin guardar', async () => {
        await render();
        await openTab('Ficha');
        typeBrief('Lo que estoy escribiendo.');

        component().saveChecklist(CASE_ID);
        await settle();

        expect(component().editor()!.revision).toBe(4);
        expect(brief().value).toBe('Lo que estoy escribiendo.');
      });

      it('«Recargar» en un conflicto descarta la ficha sin guardar y deja la versión de la otra persona', async () => {
        await render();
        await openTab('Ficha');
        typeBrief('Lo que estoy escribiendo.');
        api['createNode'].mockReturnValueOnce(conflictWith(editorView({ revision: 9, context: 'Contexto de la otra persona.', learningObjectives: ['Su objetivo.'] })));
        dialog.open.mockReturnValue({ closed: of('reload') });
        component().openPanel({ kind: 'node-create' });
        component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

        component().saveNode(CASE_ID);
        await settle();

        expect(brief().value).toBe('Contexto de la otra persona.');
        expect([...host().querySelectorAll<HTMLTextAreaElement>('app-case-brief-editor textarea')][1].value).toBe('Su objetivo.');
      });

      it('si no hay nada sin guardar, la ficha sigue lo que cambie en el servidor', async () => {
        await render();
        await openTab('Ficha');
        api['caseEditor'].mockReturnValue(of(editorView({ revision: 5, context: 'Cambió en otra sesión.' })));

        caseChanges.next(CASE_ID);
        await settle();

        expect(brief().value).toBe('Cambió en otra sesión.');
      });

      it('al guardar la ficha queda limpia: lo guardado vuelve normalizado y vuelve a seguir al servidor', async () => {
        await render();
        await openTab('Ficha');
        typeBrief('  Nuevo contexto.  ');
        api['updateBrief'].mockReturnValue(of(editorView({ revision: 4, context: 'Nuevo contexto.' })));
        host().querySelector('app-case-brief-editor form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await settle();

        expect(api['updateBrief']).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({ context: 'Nuevo contexto.' }), 3);
        expect(brief().value).toBe('Nuevo contexto.');
        expect(component().briefForm!.pristine).toBe(true);

        api['caseEditor'].mockReturnValue(of(editorView({ revision: 6, context: 'Otro cambio.' })));
        caseChanges.next(CASE_ID);
        await settle();
        expect(brief().value).toBe('Otro cambio.');
      });

      it('si se escribió más mientras se guardaba, lo nuevo no se pierde', async () => {
        await render();
        await openTab('Ficha');
        typeBrief('Primera versión.');
        const pending = new Subject<CaseEditorView>();
        api['updateBrief'].mockReturnValue(pending);
        host().querySelector('app-case-brief-editor form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        typeBrief('Primera versión y algo más.');

        pending.next(editorView({ revision: 4, context: 'Primera versión.' }));
        pending.complete();
        await settle();

        expect(brief().value).toBe('Primera versión y algo más.');
        expect(component().briefForm!.dirty).toBe(true);
      });
    });

    describe('Ficha', () => {
      it('guardar la ficha manda el contexto y los objetivos con la revisión vigente', async () => {
        await render();
        await openTab('Ficha');
        expect(host().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Una mujer llega a urgencias.');

        const objectives = [...host().querySelectorAll<HTMLTextAreaElement>('textarea')][1];
        objectives.value = 'Validar sin juzgar.\nNombrar la emoción.';
        objectives.dispatchEvent(new Event('input'));
        host().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await settle();

        expect(api['updateBrief']).toHaveBeenCalledWith(
          CASE_ID, { context: 'Una mujer llega a urgencias.', learningObjectives: ['Validar sin juzgar.', 'Nombrar la emoción.'] }, 3);
        expect(notify['success']).toHaveBeenCalledWith('Ficha del caso guardada.');
      });

      it('«Agregar personaje» abre la hoja y guardar crea el personaje', async () => {
        await render();
        await openTab('Ficha');

        buttonLabelled('Agregar personaje')!.click();
        expect(component().panel()).toEqual({ kind: 'character-create' });
        expect(component().characterForm!.value).toEqual({
          characterKey: '', displayName: '', roleLabel: '', portraitKey: '', showInBrief: true, displayOrder: 1,
        });
        component().characterForm!.patchValue({ characterKey: 'sofia', displayName: 'Sofía', roleLabel: 'Consultante' });
        component().saveCharacter(CASE_ID);
        await settle();

        expect(api['createCharacter']).toHaveBeenCalledWith(CASE_ID, {
          characterKey: 'sofia', displayName: 'Sofía', roleLabel: 'Consultante', portraitKey: '', showInBrief: true, displayOrder: 1,
        }, 3);
        expect(notify['success']).toHaveBeenCalledWith('Personaje guardado.');
      });

      it('un personaje con la clave o el nombre de solo espacios no se envía', async () => {
        await render();
        component().openPanel({ kind: 'character-create' });
        component().characterForm!.patchValue({ characterKey: '   ', displayName: 'Sofía' });
        component().save();
        component().characterForm!.patchValue({ characterKey: 'sofia', displayName: '  ' });
        component().save();

        expect(api['createCharacter']).not.toHaveBeenCalled();
        expect(component().characterForm!.get('characterKey')!.touched).toBe(true);
      });

      it('editar un personaje parte de sus datos y guarda sobre él', async () => {
        await render();
        const marta = component().editor()!.characters[0];

        component().openPanel({ kind: 'character-edit', character: marta });
        expect(component().characterForm!.value).toMatchObject({ characterKey: 'marta', displayName: 'Marta', showInBrief: true });
        component().characterForm!.patchValue({ showInBrief: false });
        component().saveCharacter(CASE_ID);
        await settle();

        expect(api['updateCharacter']).toHaveBeenCalledWith(CASE_ID, 51, expect.objectContaining({ characterKey: 'marta', showInBrief: false }), 3);
      });

      it('eliminar un personaje pide confirmar y avisa que sus objetos del mundo quedan sin personaje', async () => {
        await render();
        dialog.confirm.mockResolvedValue(true);

        await component().confirmDeleteCharacter(CASE_ID, component().editor()!.characters[0]);
        await settle();

        expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Eliminar personaje', message: expect.stringContaining('Marta'), tone: 'danger',
        }));
        expect(api['deleteCharacter']).toHaveBeenCalledWith(CASE_ID, 51, 3);
        expect(notify['success']).toHaveBeenCalledWith('Personaje eliminado.');
      });
    });

    describe('los textos de la decisión y del nodo', () => {
      it('editar una decisión parte de sus textos y guarda la consecuencia, la retroalimentación y el fundamento', async () => {
        await render({ view: editorView({ decisions: [decisionEdge] }) });

        component().openPanel({ kind: 'decision-edit', edge: decisionEdge });
        expect(component().decisionForm!.value).toMatchObject({
          consequenceText: 'Ella respira más tranquila.', feedbackText: 'Validar sostiene la alianza.', theoryBasis: 'Rogers (1957).',
        });
        component().decisionForm!.patchValue({ feedbackText: 'Validar sin juzgar sostiene la alianza.', theoryBasis: '' });
        component().saveDecision(CASE_ID);
        await settle();

        expect(api['updateDecision']).toHaveBeenCalledWith(CASE_ID, 40, expect.objectContaining({
          consequenceText: 'Ella respira más tranquila.', feedbackText: 'Validar sin juzgar sostiene la alianza.', theoryBasis: '',
        }), 3);
      });

      it('una decisión nueva sale con los tres textos vacíos, no ausentes', async () => {
        await render();
        component().openPanel({ kind: 'decision-create' });
        component().decisionForm!.patchValue({ sourceNodeId: 1, targetNodeId: 2, text: 'Escuchar' });
        component().saveDecision(CASE_ID);
        await settle();

        expect(api['createDecision']).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({
          consequenceText: '', feedbackText: '', theoryBasis: '',
        }), 3);
      });

      it('un texto de más de 1.200 caracteres no se envía y marca el campo', async () => {
        await render();
        component().openPanel({ kind: 'decision-create' });
        component().decisionForm!.patchValue({ sourceNodeId: 1, targetNodeId: 2, text: 'Escuchar', feedbackText: 'a'.repeat(1201) });

        component().save();

        expect(api['createDecision']).not.toHaveBeenCalled();
        expect(component().decisionForm!.get('feedbackText')!.touched).toBe(true);
      });

      it('el nodo parte de su enunciado y lo guarda; uno nuevo sale con el enunciado vacío', async () => {
        await render();
        component().openPanel({ kind: 'node-edit', node: node(1, 'inicio', 'Inicio del caso', { decisionPrompt: '¿Qué haces primero?' }) });
        expect(component().nodeForm!.get('decisionPrompt')!.value).toBe('¿Qué haces primero?');
        component().saveNode(CASE_ID);
        await settle();
        expect(api['updateNode']).toHaveBeenCalledWith(CASE_ID, 1, expect.objectContaining({ decisionPrompt: '¿Qué haces primero?' }), 3);

        component().openPanel({ kind: 'node-create' });
        component().nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });
        component().saveNode(CASE_ID);
        await settle();
        // Tras el primer guardado la pantalla adoptó la revisión 4 que devolvió el servidor.
        expect(api['createNode']).toHaveBeenCalledWith(CASE_ID, expect.objectContaining({ decisionPrompt: '' }), 4);
      });
    });
  });

  // req: REGLA-005, RNF-08
  describe('una versión que no es borrador es de solo lectura', () => {
    it('los botones de crear y editar dicen por qué no se pueden usar y la hoja no se abre', async () => {
      await render({ view: editorView({ status: 'PUBLISHED' }) });
      expect(text(host())).toContain('Esta versión no es un borrador');

      tab('Mapas')!.click();
      await settle();
      const create = buttonLabelled('Nuevo mapa')!;
      expect(create.getAttribute('aria-disabled')).toBe('true');

      component().openPanel({ kind: 'map-create' });
      expect(dialog.sheet).not.toHaveBeenCalled();
      expect(notify['warning']).toHaveBeenCalledWith(expect.stringContaining('clónala'));
    });

    it('el borrador sí se edita: «Nuevo mapa» está habilitado', async () => {
      await render();
      tab('Mapas')!.click();
      await settle();
      expect(buttonLabelled('Nuevo mapa')!.getAttribute('aria-disabled')).not.toBe('true');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('hoja de formularios', () => {
    it('abrir un formulario abre la hoja lateral con la pantalla como dueña del formulario', async () => {
      await render();
      component().openPanel({ kind: 'tool-create' });

      expect(dialog.sheet).toHaveBeenCalledWith(CaseEditorSheetComponent, expect.objectContaining({
        side: 'end', data: { host: component() },
      }));
      expect(component().panel()).toEqual({ kind: 'tool-create' });
    });

    it('guardar con el formulario incompleto no llama al servidor y marca los campos', async () => {
      await render();
      component().openPanel({ kind: 'node-create' });

      component().save();

      expect(api['createNode']).not.toHaveBeenCalled();
      expect(component().nodeForm!.get('title')!.touched).toBe(true);
      expect(component().panel()).toEqual({ kind: 'node-create' });
    });

    it('un guardado fallido deja la hoja abierta y uno exitoso la cierra', async () => {
      await render();
      const close = vi.fn();
      dialog.sheet.mockReturnValue({ close, closed: new Subject<void>() });
      component().openPanel({ kind: 'tool-create' });
      component().toolForm!.patchValue({ toolCode: 'CODE', label: 'Herramienta', description: 'Descripción' });
      api['createTool'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Código duplicado' } })));

      component().save();
      await settle();
      expect(notify['error']).toHaveBeenCalledWith('Código duplicado');
      expect(component().panel()).toEqual({ kind: 'tool-create' });
      expect(close).not.toHaveBeenCalled();

      component().save();
      await settle();
      expect(notify['success']).toHaveBeenCalledWith('Herramienta guardada.');
      expect(component().panel()).toBeNull();
      expect(close).toHaveBeenCalled();
    });

    it('si la hoja se cierra con Esc o con el fondo, el panel también se da por cerrado', async () => {
      await render();
      const closed = new Subject<void>();
      dialog.sheet.mockReturnValue({ close: vi.fn(), closed });
      component().openPanel({ kind: 'tool-create' });

      closed.next();

      expect(component().panel()).toBeNull();
    });
  });

  // req: RNF-08
  describe('eliminar', () => {
    it('pide confirmación en tono de peligro y solo entonces llama al servidor con la revisión vigente', async () => {
      await render();
      let answer!: (value: boolean) => void;
      dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

      component().confirmDeleteNode(CASE_ID, component().editor()!.nodes[1]);
      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Eliminar nodo', confirmLabel: 'Eliminar', tone: 'danger',
      }));
      expect(api['deleteNode']).not.toHaveBeenCalled();

      answer(true);
      await settle();
      expect(api['deleteNode']).toHaveBeenCalledWith(CASE_ID, 2, 3);
      expect(notify['success']).toHaveBeenCalledWith('Nodo eliminado.');
    });

    it('cancelar no elimina', async () => {
      await render();
      dialog.confirm.mockResolvedValue(false);

      component().confirmDeleteNode(CASE_ID, component().editor()!.nodes[1]);
      await settle();

      expect(api['deleteNode']).not.toHaveBeenCalled();
    });
  });

  // req: RNF-04
  describe('sistema de diseño (contrato de código)', () => {
    const source = (file: string) => readFileSync(join(__dirname, file), 'utf-8');

    it.each(['case-editor.component.ts', 'case-editor.component.html', 'case-editor.component.scss', 'case-editor-sheet.component.ts'])(
      '%s no usa Material, clases psy-* ni estilos en línea',
      file => {
        const code = source(file);
        expect(code).not.toMatch(/mat-|Mat[A-Z]\w+Module|@angular\/material/);
        expect(code).not.toMatch(/\bpsy-|liquid-glass/);
        expect(code).not.toMatch(/\sstyle="/);
      },
    );
  });
});
