// El editor importa WorldPreviewComponent -> GameWorldComponent, que hace
// `import Phaser from 'phaser'`; Phaser inicializa un canvas WebGL al cargarse y
// jsdom no lo soporta. Solo se evalúa `extends Phaser.Scene`; el resto vive en
// métodos que estos tests nunca ejecutan (no se renderiza template).
// WorldEditorComponent importa Konva, que se publica como ESM y jest no lo
// transforma; su uso también vive solo en métodos.
vi.mock('konva', () => ({ __esModule: true, default: {} }));
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import { AuthoringApi } from '../../core/api/authoring.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { CaseEditorView, NodeEditorState } from '../../core/models/simulation.model';
import { CaseEditorComponent } from './case-editor.component';
import type { Mock } from 'vitest';

const source = readFileSync(join(__dirname, 'case-editor.component.ts'), 'utf-8');

describe('editor de casos: feedback de acciones (contrato de texto)', () => {
  it('ninguna acción descarta el error en silencio', () => {
    expect(source).not.toContain('error: () => this.busy.set(false)');
  });

  it('todas las acciones pasan por runAction con éxito y error', () => {
    expect(source).toContain('private runAction(call: Observable<CaseEditorView>, success: string, fallback: string): void {');
    expect((source.match(/this\.runAction\(/g) ?? []).length).toBe(12);
    expect(source).toContain('this.notify.success(success);');
    expect(source).toContain('const text = apiErrorMessage(err, fallback);');
  });

  it('publicar pide confirmación', () => {
    expect(source).toMatch(/confirmPublish\(caseVersionId: number\)/);
    expect(source).toContain('(click)="confirmPublish(model.caseVersionId)"');
    expect(source).toContain(`[confirmLabel]="confirmState()?.confirmLabel ?? 'Eliminar'"`);
  });
});

/**
 * Comportamiento del camino principal de `runAction`.
 *
 * Igual que los demás specs del simulador: no se renderiza el template. Se
 * instancia el componente con dobles y se ejercitan los métodos públicos.
 */
describe('editor de casos: feedback de acciones (comportamiento)', () => {
  const CASE_VERSION_ID = 7;
  const editorView = { caseVersionId: CASE_VERSION_ID, title: 'Caso demo' } as unknown as CaseEditorView;

  let component: CaseEditorComponent;
  let sim: {
    caseEditor: Mock;
    publishCase: Mock;
    updateChecklist: Mock;
    createTool: Mock;
    deleteNode: Mock;
    updateNode: Mock;
    createNode: Mock;
  };
  let notify: { success: Mock; error: Mock };

  function setup() {
    sim = {
      caseEditor: vi.fn(() => of(editorView)),
      publishCase: vi.fn(() => of(editorView)),
      updateChecklist: vi.fn(() => of(editorView)),
      createTool: vi.fn(() => of(editorView)),
      deleteNode: vi.fn(() => of(editorView)),
      updateNode: vi.fn(() => of(editorView)),
      createNode: vi.fn(() => of(editorView)),
    };
    notify = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthoringApi, useValue: sim },
        { provide: NotificationService, useValue: notify },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: String(CASE_VERSION_ID) }) } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CaseEditorComponent());
  }

  function backendError(status: number, body: unknown) {
    return throwError(() => new HttpErrorResponse({ status, error: body }));
  }

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('éxito: avisa con el texto de la acción, refresca el editor y libera busy', () => {
    component.publish(CASE_VERSION_ID);

    expect(sim.publishCase).toHaveBeenCalledWith(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
    expect(notify.error).not.toHaveBeenCalled();
    expect(component.editor()).toBe(editorView);
    expect(component.busy()).toBe(false);
  });

  it('error del backend: avisa con su mensaje, libera busy y no avisa éxito', () => {
    sim.publishCase.mockReturnValue(backendError(500, { message: 'Mensaje del backend' }));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error).toHaveBeenCalledWith('Mensaje del backend');
    expect(notify.success).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('error sin mensaje útil: avisa con el texto de respaldo de la acción', () => {
    sim.publishCase.mockReturnValue(backendError(500, null));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).toHaveBeenCalledWith('No fue posible publicar el caso.');
    expect(component.busy()).toBe(false);
  });

  it('sin conexión (status 0): no duplica el aviso del interceptor pero libera busy', () => {
    sim.publishCase.mockReturnValue(backendError(0, null));

    component.publish(CASE_VERSION_ID);

    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it('mantiene busy mientras la petición está en vuelo', () => {
    const pending = new Subject<CaseEditorView>();
    sim.publishCase.mockReturnValue(pending);

    component.publish(CASE_VERSION_ID);
    expect(component.busy()).toBe(true);
    expect(notify.success).not.toHaveBeenCalled();

    pending.next(editorView);
    expect(component.busy()).toBe(false);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
  });

  it('saveChecklist avisa el éxito y el error de la lista de verificación', () => {
    component.ngOnInit();

    component.saveChecklist(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Lista de verificación guardada.');

    sim.updateChecklist.mockReturnValue(backendError(400, { detail: 'Checklist inválida' }));
    component.saveChecklist(CASE_VERSION_ID);
    expect(notify.error).toHaveBeenCalledWith('Checklist inválida');
    expect(component.busy()).toBe(false);
  });

  it('un guardado fallido deja el panel abierto y uno exitoso lo cierra', () => {
    component.openPanel({ kind: 'tool-create' });
    component.toolForm!.patchValue({ toolCode: 'CODE', label: 'Herramienta', description: 'Descripción' });
    sim.createTool.mockReturnValue(backendError(422, { message: 'Código duplicado' }));

    component.saveTool(CASE_VERSION_ID);
    expect(notify.error).toHaveBeenCalledWith('Código duplicado');
    expect(component.panel()).toEqual({ kind: 'tool-create' });

    sim.createTool.mockReturnValue(of(editorView));
    component.saveTool(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Herramienta guardada.');
    expect(component.panel()).toBeNull();
  });

  it('publicar pide confirmación y no llama al backend hasta confirmar', () => {
    component.confirmPublish(CASE_VERSION_ID);

    expect(sim.publishCase).not.toHaveBeenCalled();
    expect(component.confirmState()).toEqual(expect.objectContaining({
      title: 'Publicar caso',
      confirmLabel: 'Publicar',
    }));

    component.runConfirm();

    expect(component.confirmState()).toBeNull();
    expect(sim.publishCase).toHaveBeenCalledWith(CASE_VERSION_ID);
    expect(notify.success).toHaveBeenCalledWith('Caso publicado.');
  });

  it('eliminar sigue confirmando y avisa el resultado', () => {
    component.confirmDeleteNode(CASE_VERSION_ID, { id: 3, title: 'Nodo A' } as never);

    expect(sim.deleteNode).not.toHaveBeenCalled();
    expect(component.confirmState()?.confirmLabel).toBeUndefined();

    component.runConfirm();

    expect(sim.deleteNode).toHaveBeenCalledWith(CASE_VERSION_ID, 3);
    expect(notify.success).toHaveBeenCalledWith('Nodo eliminado.');
  });

  // El formulario del nodo no edita las herramientas requeridas ni los recursos de apoyo;
  // antes los enviaba siempre vacíos y guardar el título borraba los datos del nodo.
  it('guardar un nodo existente conserva sus herramientas y sus apoyos', () => {
    const node = {
      id: 3, key: 'n-3', title: 'Nodo', narrative: 'Texto', warningMessage: null,
      startNode: false, terminal: false, sensitiveContent: false, safeExitRequired: false,
      positionX: 10, positionY: 20, requiredTools: ['PAP'], supportResources: ['Línea 106'],
    } as unknown as NodeEditorState;
    component.openPanel({ kind: 'node-edit', node });

    component.saveNode(CASE_VERSION_ID);

    expect(sim.updateNode).toHaveBeenCalledWith(
      CASE_VERSION_ID,
      3,
      expect.objectContaining({ requiredTools: ['PAP'], supportResources: ['Línea 106'] }),
    );
  });

  it('un nodo nuevo se crea con las listas vacías', () => {
    component.openPanel({ kind: 'node-create' });
    component.nodeForm!.patchValue({ nodeKey: 'nuevo', title: 'Nuevo', narrative: 'Texto' });

    component.saveNode(CASE_VERSION_ID);

    expect(sim.createNode).toHaveBeenCalledWith(
      CASE_VERSION_ID,
      expect.objectContaining({ requiredTools: [], supportResources: [] }),
    );
  });
});
