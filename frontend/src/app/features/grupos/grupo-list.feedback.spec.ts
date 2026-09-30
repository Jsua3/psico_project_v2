import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Grupo, GrupoEstudiante, GrupoService } from '../../core/api/grupo.service';
import { SimulationService } from '../../core/api/simulation.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { GrupoListComponent } from './grupo-list.component';

/**
 * Feedback de acciones de la pantalla Grupos.
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y se ejercitan sus métodos públicos.
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 };
const grupoB: Grupo = { id: 2, nombre: 'Cohorte B', codigo: 'COH-B', totalEstudiantes: 0 };
const marta = { id: 11, nombre: 'Marta', apellido: 'Ríos', email: 'marta@siep.test', role: 'ESTUDIANTE', activo: true } as GrupoEstudiante;
const caso = { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' } as SimulationCaseSummary;

function backendError(status: number, body: unknown) {
  return throwError(() => new HttpErrorResponse({ status, error: body }));
}

describe('grupos: feedback de acciones (comportamiento)', () => {
  let component: GrupoListComponent;
  let grupos: Record<
    | 'listar' | 'crear' | 'actualizar' | 'eliminar' | 'quitarEstudiante' | 'agregarEstudiante'
    | 'asignarCaso' | 'quitarCaso' | 'importSpec' | 'listarEstudiantes' | 'listarCasos',
    jest.Mock
  >;
  let simulation: { listCases: jest.Mock };
  let notify: { success: jest.Mock; error: jest.Mock; warning: jest.Mock; info: jest.Mock };
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    grupos = {
      listar: jest.fn(() => of([grupoA, grupoB])),
      crear: jest.fn(),
      actualizar: jest.fn(),
      eliminar: jest.fn(),
      quitarEstudiante: jest.fn(),
      agregarEstudiante: jest.fn(),
      asignarCaso: jest.fn(),
      quitarCaso: jest.fn(),
      importSpec: jest.fn(),
      listarEstudiantes: jest.fn(() => of([marta])),
      listarCasos: jest.fn(() => of([])),
    };
    simulation = { listCases: jest.fn(() => of([caso])) };
    notify = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: GrupoService, useValue: grupos },
        { provide: SimulationService, useValue: simulation },
        { provide: NotificationService, useValue: notify },
      ],
    });
    component = TestBed.runInInjectionContext(() => new GrupoListComponent());
    component.grupos.set([grupoA, grupoB]);
    component.grupoActivo.set(grupoA);
    component.estudiantes.set([marta]);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    TestBed.resetTestingModule();
  });

  describe('crear y editar', () => {
    it('crear avisa el éxito', () => {
      const nuevo: Grupo = { id: 3, nombre: 'Cohorte C', codigo: 'COH-C', totalEstudiantes: 0 };
      grupos.crear.mockReturnValue(of(nuevo));
      component.form.setValue({ nombre: 'Cohorte C', codigo: 'COH-C' });

      component.crear();

      expect(grupos.crear).toHaveBeenCalledWith('Cohorte C', 'COH-C');
      expect(notify.success).toHaveBeenCalledWith('Grupo creado.');
      expect(component.grupos()).toContain(nuevo);
      expect(component.saving()).toBe(false);
    });

    it('crear con error del backend avisa su mensaje y libera saving', () => {
      grupos.crear.mockReturnValue(backendError(409, { message: 'Ya existe un grupo con ese código.' }));
      component.form.setValue({ nombre: 'Cohorte C', codigo: 'COH-A' });

      component.crear();

      expect(notify.error).toHaveBeenCalledWith('Ya existe un grupo con ese código.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.error()).toBe('');
      expect(component.saving()).toBe(false);
    });

    it('crear con error sin mensaje avisa el texto de respaldo', () => {
      grupos.crear.mockReturnValue(backendError(500, null));
      component.form.setValue({ nombre: 'Cohorte C', codigo: 'COH-C' });

      component.crear();

      expect(notify.error).toHaveBeenCalledWith('No fue posible crear el grupo.');
    });

    it('actualizar avisa el éxito y cierra la edición', () => {
      const editado = { ...grupoA, nombre: 'Cohorte A2' };
      grupos.actualizar.mockReturnValue(of(editado));
      component.editarGrupo(grupoA);
      component.form.setValue({ nombre: 'Cohorte A2', codigo: 'COH-A' });

      component.actualizarGrupo();

      expect(grupos.actualizar).toHaveBeenCalledWith(1, { nombre: 'Cohorte A2', codigo: 'COH-A' });
      expect(notify.success).toHaveBeenCalledWith('Grupo actualizado.');
      expect(component.editandoGrupo()).toBeNull();
      expect(component.grupoActivo()).toEqual(editado);
    });

    it('actualizar con error avisa el mensaje del backend y deja la edición abierta', () => {
      grupos.actualizar.mockReturnValue(backendError(400, { message: 'Código inválido.' }));
      component.editarGrupo(grupoA);
      component.form.setValue({ nombre: 'Cohorte A2', codigo: '!!' });

      component.actualizarGrupo();

      expect(notify.error).toHaveBeenCalledWith('Código inválido.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.editandoGrupo()).toBe(grupoA);
      expect(component.saving()).toBe(false);
    });
  });

  describe('borrar grupo', () => {
    it('ya no usa window.confirm: abre el diálogo propio sin llamar al backend', () => {
      component.eliminarGrupo(grupoA);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(grupos.eliminar).not.toHaveBeenCalled();
      expect(component.pendingConfirm()).toEqual(expect.objectContaining({
        title: 'Borrar grupo',
        confirmLabel: 'Borrar',
        message: expect.stringContaining('"Cohorte A"'),
      }));
    });

    it('al confirmar borra, avisa el éxito y limpia el detalle del grupo activo', () => {
      grupos.eliminar.mockReturnValue(of({ id: 1 }));
      component.eliminarGrupo(grupoA);

      component.runPendingConfirm();

      expect(component.pendingConfirm()).toBeNull();
      expect(grupos.eliminar).toHaveBeenCalledWith(1);
      expect(notify.success).toHaveBeenCalledWith('Grupo eliminado.');
      expect(component.grupos()).toEqual([grupoB]);
      expect(component.grupoActivo()).toBeNull();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('una confirmación se ejecuta una sola vez', () => {
      grupos.eliminar.mockReturnValue(of({ id: 1 }));
      component.eliminarGrupo(grupoA);

      component.runPendingConfirm();
      component.runPendingConfirm();

      expect(grupos.eliminar).toHaveBeenCalledTimes(1);
      expect(notify.success).toHaveBeenCalledTimes(1);
    });

    it('cancelar el diálogo no borra nada', () => {
      component.eliminarGrupo(grupoA);

      component.pendingConfirm.set(null);
      component.runPendingConfirm();

      expect(grupos.eliminar).not.toHaveBeenCalled();
      expect(component.grupos()).toEqual([grupoA, grupoB]);
    });

    it('con un error 500 avisa el mensaje del backend y conserva el grupo', () => {
      grupos.eliminar.mockReturnValue(backendError(500, { message: 'El grupo tiene simulaciones en curso.' }));
      component.eliminarGrupo(grupoA);

      component.runPendingConfirm();

      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(notify.error).toHaveBeenCalledWith('El grupo tiene simulaciones en curso.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.grupos()).toEqual([grupoA, grupoB]);
      expect(component.error()).toBe('');
    });

    it('con un error sin mensaje avisa el texto de respaldo', () => {
      grupos.eliminar.mockReturnValue(backendError(500, null));
      component.eliminarGrupo(grupoA);

      component.runPendingConfirm();

      expect(notify.error).toHaveBeenCalledWith('No fue posible borrar el grupo.');
    });

    it('sin conexión (status 0) no duplica el aviso del interceptor', () => {
      grupos.eliminar.mockReturnValue(backendError(0, null));
      component.eliminarGrupo(grupoA);

      component.runPendingConfirm();

      expect(notify.error).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
    });
  });

  describe('quitar estudiante', () => {
    it('pide confirmación con el diálogo propio y no llama al backend hasta confirmar', () => {
      component.quitarEstudiante(grupoA, marta);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(grupos.quitarEstudiante).not.toHaveBeenCalled();
      expect(component.pendingConfirm()).toEqual(expect.objectContaining({
        title: 'Quitar estudiante',
        message: '¿Quitar a Marta Ríos del grupo?',
        confirmLabel: 'Quitar',
      }));
    });

    it('al confirmar avisa el éxito con un aviso y no con el mensaje del formulario', () => {
      const actualizado = { ...grupoA, totalEstudiantes: 2 };
      grupos.quitarEstudiante.mockReturnValue(of(actualizado));
      component.quitarEstudiante(grupoA, marta);

      component.runPendingConfirm();

      expect(grupos.quitarEstudiante).toHaveBeenCalledWith(1, 11);
      expect(notify.success).toHaveBeenCalledWith('Estudiante retirado del grupo.');
      expect(component.estudiantes()).toEqual([]);
      expect(component.grupoActivo()).toEqual(actualizado);
      expect(component.mensajeEstudiante()).toBe('');
    });

    it('con error avisa el mensaje del backend', () => {
      grupos.quitarEstudiante.mockReturnValue(backendError(404, { message: 'El estudiante ya no pertenece al grupo.' }));
      component.quitarEstudiante(grupoA, marta);

      component.runPendingConfirm();

      expect(notify.error).toHaveBeenCalledWith('El estudiante ya no pertenece al grupo.');
      expect(component.mensajeEstudiante()).toBe('');
      expect(component.estudiantes()).toEqual([marta]);
    });

    it('con error sin mensaje avisa el texto de respaldo', () => {
      grupos.quitarEstudiante.mockReturnValue(backendError(500, null));
      component.quitarEstudiante(grupoA, marta);

      component.runPendingConfirm();

      expect(notify.error).toHaveBeenCalledWith('No fue posible quitar al estudiante.');
    });
  });

  describe('copiar código', () => {
    function stubClipboard(writeText: jest.Mock) {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    }
    const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    it('si se copia avisa el éxito', async () => {
      const writeText = jest.fn(() => Promise.resolve());
      stubClipboard(writeText);

      component.copiarCodigo(grupoA);
      await flush();

      expect(writeText).toHaveBeenCalledWith('COH-A');
      expect(notify.success).toHaveBeenCalledWith('Código COH-A copiado al portapapeles.');
      expect(notify.info).not.toHaveBeenCalled();
      expect(component.mensajeEstudiante()).toBe('');
    });

    it('si el portapapeles rechaza informa el código con un aviso', async () => {
      stubClipboard(jest.fn(() => Promise.reject(new Error('denegado'))));

      component.copiarCodigo(grupoA);
      await flush();

      expect(notify.info).toHaveBeenCalledWith('Código del grupo: COH-A');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.mensajeEstudiante()).toBe('');
    });

    it('si no hay portapapeles informa el código con un aviso', () => {
      component.copiarCodigo(grupoA);

      expect(notify.info).toHaveBeenCalledWith('Código del grupo: COH-A');
      expect(component.mensajeEstudiante()).toBe('');
    });
  });

  describe('asignar y retirar casos', () => {
    it('asignar avisa el éxito', () => {
      grupos.asignarCaso.mockReturnValue(of([caso]));
      component.casoForm.setValue({ caseVersionId: '12' });

      component.asignarCaso();

      expect(grupos.asignarCaso).toHaveBeenCalledWith(1, 12);
      expect(notify.success).toHaveBeenCalledWith('Caso asignado al grupo.');
      expect(component.casosAsignados()).toEqual([caso]);
      expect(component.asignandoCaso()).toBe(false);
    });

    it('asignar con error avisa el mensaje del backend y libera asignandoCaso', () => {
      grupos.asignarCaso.mockReturnValue(backendError(409, { message: 'El caso ya está asignado.' }));
      component.casoForm.setValue({ caseVersionId: '12' });

      component.asignarCaso();

      expect(notify.error).toHaveBeenCalledWith('El caso ya está asignado.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.mensajeEstudiante()).toBe('');
      expect(component.asignandoCaso()).toBe(false);
    });

    it('asignar con error sin mensaje avisa el texto de respaldo', () => {
      grupos.asignarCaso.mockReturnValue(backendError(500, null));
      component.casoForm.setValue({ caseVersionId: '12' });

      component.asignarCaso();

      expect(notify.error).toHaveBeenCalledWith('No fue posible asignar el caso al grupo.');
    });

    it('retirar avisa el éxito', () => {
      component.casosAsignados.set([caso]);
      grupos.quitarCaso.mockReturnValue(of([]));

      component.quitarCaso(12);

      expect(grupos.quitarCaso).toHaveBeenCalledWith(1, 12);
      expect(notify.success).toHaveBeenCalledWith('Caso retirado del grupo.');
      expect(component.casosAsignados()).toEqual([]);
      expect(component.asignandoCaso()).toBe(false);
    });

    it('retirar con error avisa el mensaje del backend, o el respaldo si no hay', () => {
      grupos.quitarCaso.mockReturnValue(backendError(400, { message: 'Hay estudiantes con este caso en curso.' }));
      component.quitarCaso(12);
      expect(notify.error).toHaveBeenLastCalledWith('Hay estudiantes con este caso en curso.');

      grupos.quitarCaso.mockReturnValue(backendError(500, null));
      component.quitarCaso(12);
      expect(notify.error).toHaveBeenLastCalledWith('No fue posible retirar el caso del grupo.');
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.mensajeEstudiante()).toBe('');
      expect(component.asignandoCaso()).toBe(false);
    });
  });

  describe('lo que sigue junto a su formulario', () => {
    it('agregar estudiante deja su resultado en línea y no crea un aviso', () => {
      grupos.agregarEstudiante.mockReturnValue(of({}));
      component.grupoSeleccionado.set(1);
      component.estudianteForm.setValue({ email: 'nuevo@siep.test' });

      component.confirmarAgregar();

      expect(component.mensajeEstudiante()).toBe('Estudiante agregado correctamente.');
      expect(component.mensajeEsError()).toBe(false);
      expect(notify.success).not.toHaveBeenCalled();
      expect(notify.error).not.toHaveBeenCalled();
    });
  });
});
