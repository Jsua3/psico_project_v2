// Sin `vi.mock`: el editor de mundo (Konva) y la vista previa (Phaser) van en bloques `@defer` y su módulo no se
// evalúa mientras la pestaña no se abra (estas pruebas no la abren).

import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { AuthoringApi } from '../../core/api/authoring.api';
import { AuthService } from '../../core/auth/auth.service';
import { CaseEditorView, NodeEditorState } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { CaseEditorComponent } from './case-editor.component';

/**
 * Comportamiento de las acciones del editor: nada se descarta en silencio, todo aviso dice si funcionó o por qué
 * falló, y publicar y eliminar piden confirmación antes de llamar al servidor. Igual que los demás specs del simulador,
 * no se abre ninguna pestaña del mundo: se instancia el componente con dobles y se ejercitan sus métodos.
 */
describe('editor de casos: feedback de acciones', () => {
  const CASE_VERSION_ID = 7;
  const editorView = {
    caseVersionId: CASE_VERSION_ID, title: 'Caso demo', status: 'DRAFT', semanticVersion: '1.0.0',
    nodes: [], decisions: [], maps: [], objects: [], tools: [], rubrics: [], checklistCompletion: 0, publishable: false,
    checklist: { items: [], contentReview: { fulfilled: false }, strict: false },
  } as unknown as CaseEditorView;

  let component: CaseEditorComponent;
  let sim: Record<string, Mock>;
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };
  let dialog: { confirm: Mock; sheet: Mock; open: Mock };

  const settle = () => new Promise<void>(resolve => setTimeout(resolve));

  function setup() {
    const ok = () => vi.fn(() => of(editorView));
    sim = {
      caseEditor: ok(), publishCase: ok(), cloneCaseVersion: ok(), updateChecklist: ok(),
      createNode: ok(), updateNode: ok(), deleteNode: ok(),
      createDecision: ok(), updateDecision: ok(),
      createMap: ok(), updateMap: ok(), deleteMap: ok(),
      createObject: ok(), updateObject: ok(), deleteObject: ok(),
      createTool: ok(), updateTool: ok(), deleteTool: ok(),
    };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    dialog = {
      confirm: vi.fn(() => Promise.resolve(true)),
      sheet: vi.fn(() => ({ close: vi.fn(), closed: new Subject<void>() })),
      open: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthoringApi, useValue: sim },
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
        { provide: AuthService, useValue: { currentUser: signal({ role: 'ADMIN' }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } } },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component = TestBed.createComponent(CaseEditorComponent).componentInstance;
  }

  function backendError(status: number, body: unknown) {
    return throwError(() => new HttpErrorResponse({ status, error: body }));
  }

  const node = {
    id: 3, key: 'n-3', title: 'Nodo A', narrative: 'Texto', warningMessage: null,
    startNode: false, terminal: false, sensitiveContent: false, safeExitRequired: false,
    positionX: 10, positionY: 20, requiredTools: ['PAP'], supportResources: ['Línea 106'],
  } as unknown as NodeEditorState;

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  // req: RNF-04, BLOQUE-H
  it('éxito: avisa con el texto de la acción, refresca el editor y libera busy', () => {
    component.publish(CASE_VERSION_ID);

    expect(sim['publishCase']).toHaveBeenCalledWith(CASE_VERSION_ID, undefined);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
    expect(notify.error).not.toHaveBeenCalled();
    expect(component.editor()).toBe(editorView);
    expect(component.busy()).toBe(false);
  });

  it('error del backend: avisa con su mensaje, libera busy y no avisa éxito', () => {
    sim['publishCase'].mockReturnValue(backendError(500, { message: 'Mensaje del backend' }));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error).toHaveBeenCalledWith('Mensaje del backend');
    expect(notify.success).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('error sin mensaje útil: avisa con el texto de respaldo de la acción', () => {
    sim['publishCase'].mockReturnValue(backendError(500, null));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).toHaveBeenCalledWith('No fue posible publicar el caso.');
    expect(component.busy()).toBe(false);
  });

  it('sin conexión (status 0): no duplica el aviso del interceptor pero libera busy', () => {
    sim['publishCase'].mockReturnValue(backendError(0, null));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('mantiene busy mientras la petición está en vuelo', () => {
    const pending = new Subject<CaseEditorView>();
    sim['publishCase'].mockReturnValue(pending);

    component.publish(CASE_VERSION_ID);
    expect(component.busy()).toBe(true);
    expect(notify.success).not.toHaveBeenCalled();

    pending.next(editorView);
    expect(component.busy()).toBe(false);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
  });

  // Antes se contaban a mano las 12 llamadas a `runAction` en el texto del código: lo que importa es que NINGUNA
  // acción se traga el error ni deja la pantalla ocupada.
  describe('ninguna acción descarta el error en silencio', () => {
    const actions: Array<[string, string, string, () => void]> = [
      ['guardar un nodo', 'createNode', 'No fue posible guardar el nodo.', () => {
        component.openPanel({ kind: 'node-create' });
        component.nodeForm!.patchValue({ nodeKey: 'k', title: 't', narrative: 'n' });
        component.saveNode(CASE_VERSION_ID);
      }],
      ['guardar una decisión', 'createDecision', 'No fue posible guardar la decisión.', () => {
        component.openPanel({ kind: 'decision-create' });
        component.decisionForm!.patchValue({ sourceNodeId: 1, targetNodeId: 2, text: 'x' });
        component.saveDecision(CASE_VERSION_ID);
      }],
      ['guardar un mapa', 'createMap', 'No fue posible guardar el mapa.', () => {
        component.openPanel({ kind: 'map-create' });
        component.mapForm!.patchValue({ nodeId: 1, mapKey: 'm', title: 'M' });
        component.saveMap(CASE_VERSION_ID);
      }],
      ['guardar un objeto', 'createObject', 'No fue posible guardar el objeto.', () => {
        component.openPanel({ kind: 'object-create', mapId: 11 });
        component.objectForm!.patchValue({ objectKey: 'o', label: 'O', interactionPrompt: 'Hablar' });
        component.saveObject(CASE_VERSION_ID);
      }],
      ['guardar una herramienta', 'createTool', 'No fue posible guardar la herramienta.', () => {
        component.openPanel({ kind: 'tool-create' });
        component.toolForm!.patchValue({ toolCode: 'C', label: 'L', description: 'D' });
        component.saveTool(CASE_VERSION_ID);
      }],
      ['guardar la lista de publicación', 'updateChecklist', 'No fue posible guardar la lista de verificación.', () => {
        component.ngOnInit();
        component.saveChecklist(CASE_VERSION_ID);
      }],
      ['publicar', 'publishCase', 'No fue posible publicar el caso.', () => component.publish(CASE_VERSION_ID)],
      ['clonar la versión', 'cloneCaseVersion', 'No fue posible clonar la versión.', () => component.clone(CASE_VERSION_ID)],
    ];

    it.each(actions)('%s', (_name, method, fallback, run) => {
      sim[method].mockReturnValue(backendError(500, null));

      run();

      expect(notify.error).toHaveBeenCalledWith(fallback);
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.busy()).toBe(false);
    });

    const deletions: Array<[string, string, string, () => Promise<void>]> = [
      ['eliminar un nodo', 'deleteNode', 'No fue posible eliminar el nodo.', () => component.confirmDeleteNode(CASE_VERSION_ID, node)],
      ['eliminar un mapa', 'deleteMap', 'No fue posible eliminar el mapa.', () => component.confirmDeleteMap(CASE_VERSION_ID, { id: 11, title: 'M' } as never)],
      ['eliminar un objeto', 'deleteObject', 'No fue posible eliminar el objeto.', () => component.confirmDeleteObject(CASE_VERSION_ID, { id: 21, label: 'O' } as never)],
      ['eliminar una herramienta', 'deleteTool', 'No fue posible eliminar la herramienta.', () => component.confirmDeleteTool(CASE_VERSION_ID, { id: 31, label: 'T' } as never)],
    ];

    it.each(deletions)('%s', async (_name, method, fallback, run) => {
      sim[method].mockReturnValue(backendError(500, null));

      await run();

      expect(notify.error).toHaveBeenCalledWith(fallback);
      expect(component.busy()).toBe(false);
    });
  });

  it('saveChecklist avisa el éxito y el error de la lista de verificación', () => {
    component.ngOnInit();

    component.saveChecklist(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Lista de verificación guardada.');

    sim['updateChecklist'].mockReturnValue(backendError(400, { detail: 'Checklist inválida' }));
    component.saveChecklist(CASE_VERSION_ID);
    expect(notify.error).toHaveBeenCalledWith('Checklist inválida');
    expect(component.busy()).toBe(false);
  });

  it('un guardado fallido deja el panel abierto y uno exitoso lo cierra', () => {
    component.openPanel({ kind: 'tool-create' });
    component.toolForm!.patchValue({ toolCode: 'CODE', label: 'Herramienta', description: 'Descripción' });
    sim['createTool'].mockReturnValue(backendError(422, { message: 'Código duplicado' }));

    component.saveTool(CASE_VERSION_ID);
    expect(notify.error).toHaveBeenCalledWith('Código duplicado');
    expect(component.panel()).toEqual({ kind: 'tool-create' });

    sim['createTool'].mockReturnValue(of(editorView));
    component.saveTool(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Herramienta guardada.');
    expect(component.panel()).toBeNull();
  });

  it('publicar pide confirmación y no llama al backend hasta confirmar', async () => {
    let answer!: (value: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

    const pending = component.confirmPublish(CASE_VERSION_ID);

    expect(sim['publishCase']).not.toHaveBeenCalled();
    expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Publicar caso', confirmLabel: 'Publicar' }));

    answer(true);
    await pending;

    expect(sim['publishCase']).toHaveBeenCalledWith(CASE_VERSION_ID, undefined);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
  });

  it('eliminar sigue confirmando (en tono de peligro) y avisa el resultado', async () => {
    let answer!: (value: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

    const pending = component.confirmDeleteNode(CASE_VERSION_ID, { id: 3, title: 'Nodo A' } as never);

    expect(sim['deleteNode']).not.toHaveBeenCalled();
    expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', confirmLabel: 'Eliminar' }));

    answer(true);
    await pending;

    expect(sim['deleteNode']).toHaveBeenCalledWith(CASE_VERSION_ID, 3, undefined);
    expect(notify.success).toHaveBeenCalledWith('Nodo eliminado.');
  });

  it('un segundo gesto mientras hay una confirmación abierta no abre otra', async () => {
    let answer!: (value: boolean) => void;
    dialog.confirm.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));

    const first = component.confirmPublish(CASE_VERSION_ID);
    const second = component.confirmPublish(CASE_VERSION_ID);
    await settle();

    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    answer(false);
    await Promise.all([first, second]);
    expect(sim['publishCase']).not.toHaveBeenCalled();
  });

  // El formulario del nodo no edita las herramientas requeridas ni los recursos de apoyo;
  // antes los enviaba siempre vacíos y guardar el título borraba los datos del nodo.
  it('guardar un nodo existente conserva sus herramientas y sus apoyos', () => {
    component.openPanel({ kind: 'node-edit', node });

    component.saveNode(CASE_VERSION_ID);

    expect(sim['updateNode']).toHaveBeenCalledWith(
      CASE_VERSION_ID,
      3,
      expect.objectContaining({ requiredTools: ['PAP'], supportResources: ['Línea 106'] }),
      undefined,
    );
  });

  it('un nodo nuevo se crea con las listas vacías', () => {
    component.openPanel({ kind: 'node-create' });
    component.nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

    component.saveNode(CASE_VERSION_ID);

    expect(sim['createNode']).toHaveBeenCalledWith(
      CASE_VERSION_ID,
      expect.objectContaining({ requiredTools: [], supportResources: [] }),
      undefined,
    );
  });
});
