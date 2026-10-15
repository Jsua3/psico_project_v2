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
  positionX: null, positionY: null, ...over,
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
    nodes: [node(1, 'inicio', 'Inicio del caso', { startNode: true }), node(2, 'cierre', 'Cierre', { terminal: true })],
    decisions: [],
    maps: [{ id: 11, key: 'sala', title: 'Sala de espera', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430, nodeId: 1, nodeKey: 'inicio' }],
    objects: [{
      id: 21, key: 'consultante', label: 'Consultante', type: 'PERSON', x: 200, y: 300, width: 48, height: 48, colorHex: '#4FA3A5',
      icon: 'psychology', shortCode: 'CON', collision: false, visible: true, interactionPrompt: 'Hablar', interactionText: '',
      decisionOptionId: null, toolCode: null, mapId: 11,
    }],
    tools: [{ id: 31, code: 'PAP', label: 'Primeros auxilios psicológicos', icon: 'psychology', category: 'clinical', description: 'Guía breve', active: true }],
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
      publishCase: vi.fn(() => of(editorView({ revision: 4, status: 'PUBLISHED' }))),
      cloneCaseVersion: vi.fn(() => of(editorView({ revision: 1 }))),
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
    it('un solo h1 con el título del caso, la región de estado siempre presente y las ocho pestañas', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Caso de duelo');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect([...host().querySelectorAll('[role="tab"]')].map(text)).toEqual([
        'Grafo DAG', 'Mapas', 'Objetos', 'Herramientas', 'Rúbricas', 'Checklist ético', 'Mundo', 'Vista previa',
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
  describe('cabecera: clonar y publicar', () => {
    it('el administrador ve «Publicar» deshabilitado con el motivo «Falta: …» mientras la lista esté incompleta', async () => {
      await render();
      const publish = buttonLabelled('Publicar')!;
      expect(publish).toBeDefined();
      expect(publish.getAttribute('aria-disabled')).toBe('true');
      expect(text(publish.querySelector('span[hidden]'))).toBe('Falta: Revisión ética y Sin lenguaje estigmatizante ni estereotipos clínicos.');
    });

    it('con la lista completa, «Publicar» queda habilitado', async () => {
      await render({ view: editorView({ checklistCompletion: 100, publishable: true, checklist: COMPLETE_CHECKLIST as never }) });
      expect(buttonLabelled('Publicar')!.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('el docente no ve «Publicar» (solo el administrador publica) pero sí «Clonar versión»', async () => {
      await render({ role: 'PROFESOR' });
      expect(buttonLabelled('Publicar')).toBeUndefined();
      expect(buttonLabelled('Clonar versión')).toBeDefined();
    });

    it('publicar pide confirmación y no llama al servidor hasta confirmar; envía la revisión vigente', async () => {
      await render({ view: editorView({ checklistCompletion: 100, publishable: true, checklist: COMPLETE_CHECKLIST as never }) });
      let answer!: (value: boolean) => void;
      dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

      buttonLabelled('Publicar')!.click();
      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Publicar caso', confirmLabel: 'Publicar' }));
      expect(api['publishCase']).not.toHaveBeenCalled();

      answer(true);
      await settle();
      expect(api['publishCase']).toHaveBeenCalledWith(CASE_ID, 3);
      expect(notify['success']).toHaveBeenCalledWith('Caso publicado.');
    });

    it('si se cancela la confirmación no se publica', async () => {
      await render({ view: editorView({ checklistCompletion: 100, publishable: true, checklist: COMPLETE_CHECKLIST as never }) });
      dialog.confirm.mockResolvedValue(false);

      buttonLabelled('Publicar')!.click();
      await settle();

      expect(api['publishCase']).not.toHaveBeenCalled();
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
      for (const name of ['Grafo DAG', 'Mapas', 'Objetos', 'Herramientas', 'Rúbricas', 'Checklist ético']) {
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
