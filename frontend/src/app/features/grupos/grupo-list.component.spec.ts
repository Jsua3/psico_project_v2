import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AssignmentService } from '../../core/api/assignment.service';
import { Grupo, GrupoEstudiante, GrupoImportResult, GrupoService } from '../../core/api/grupo.service';
import { SimulationService } from '../../core/api/simulation.service';
import { Assignment } from '../../core/models/assignment.model';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiMenu } from '../../shared/ui/menu/ui-menu';
import { GrupoListComponent } from './grupo-list.component';

/**
 * Pantalla Grupos en el sistema de la biblioteca (plan visual F7-2): la tabla con UN menú de acciones por fila en vez
 * de cinco botones de texto, esqueleto y error DENTRO de la tabla, ninguna cifra falsa mientras carga, zona de
 * importación con arrastre y los diálogos de la biblioteca. La lógica de cada acción vive en las specs de
 * comportamiento (`grupo-list.feedback.spec.ts`, `grupo-list.validation.spec.ts`).
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 };
const grupoB: Grupo = { id: 2, nombre: 'Cohorte B', codigo: 'COH-B', totalEstudiantes: 0 };
const marta = { id: 11, nombre: 'Marta', apellido: 'Ríos', email: 'marta@siep.test', role: 'ESTUDIANTE', activo: true } as GrupoEstudiante;
const caso = { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' } as SimulationCaseSummary;
const otroCaso = { caseVersionId: 13, code: 'CASO-13', title: 'Caso trece', semanticVersion: '2.0.0' } as SimulationCaseSummary;
const asignacion: Assignment = { id: 5, caseVersionId: 12, target: { type: 'GROUP', groupId: 1 }, state: 'OPEN', active: true, sortOrder: 0 };

interface Api {
  listar: () => Observable<Grupo[]>;
  estudiantes: () => Observable<GrupoEstudiante[]>;
  asignaciones: () => Observable<Assignment[]>;
  casosPublicados: () => Observable<SimulationCaseSummary[]>;
}

describe('pantalla Grupos (F7-2)', () => {
  let fixture: ComponentFixture<GrupoListComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { confirm: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => [...host().querySelectorAll('.gl-list tbody tr')];
  const stats = () => Object.fromEntries([...host().querySelectorAll('ui-stat')]
    .map(el => [text(el.querySelector('.ui-stat__label')), text(el.querySelector('.ui-stat__value'))]));
  const component = () => fixture.componentInstance;

  async function render(api: Partial<Api> = {}, { stable = true } = {}) {
    service = {
      listar: vi.fn(api.listar ?? (() => of([grupoA, grupoB]))),
      // La especificación de E2: sin columna `password` (RN-10).
      importSpec: vi.fn(() => of({ requiredColumns: ['nombre', 'apellido', 'email'], optionalColumns: [], columns: ['nombre', 'apellido', 'email'], templateFilename: 'plantilla.xlsx', acceptedExtensions: ['.xlsx'] })),
      listarEstudiantes: vi.fn(api.estudiantes ?? (() => of([marta]))),
      crear: vi.fn(), actualizar: vi.fn(), eliminar: vi.fn(), quitarEstudiante: vi.fn(), agregarEstudiante: vi.fn(),
      importarEstudiantes: vi.fn(), descargarPlantillaImportacion: vi.fn(),
    };
    dialog = { confirm: vi.fn(() => Promise.resolve(true)) };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GrupoListComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: GrupoService, useValue: service },
        { provide: SimulationService, useValue: { listCases: vi.fn(api.casosPublicados ?? (() => of([caso, otroCaso]))) } },
        // F10-5: los casos asignados los lee y los cambia su propio componente, por las asignaciones con ventana (C7).
        { provide: AssignmentService, useValue: { list: vi.fn(api.asignaciones ?? (() => of([asignacion]))), create: vi.fn(), update: vi.fn(), remove: vi.fn() } },
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
      ],
    });
    fixture = TestBed.createComponent(GrupoListComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
  }

  async function openDetail(group: Grupo = grupoA) {
    component().gestionarGrupo(group);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('un solo h1 «Grupos» y la región de estado siempre presente', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Grupos');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
    });

    it('mientras carga: esqueleto dentro de la tabla, ninguna cifra (ni un 0 falso) y el estado leído', async () => {
      vi.useFakeTimers();
      const loading = new Subject<Grupo[]>();
      await render({ listar: () => loading }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('.ui-table__loading ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(host().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando grupos…');

      loading.next([grupoA, grupoB]);
      loading.complete();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-table__loading')).toHaveLength(0);
      expect(stats()['Grupos activos']).toBe('2');
    });

    it('con grupos: una fila por grupo y cifras reales', async () => {
      await render();
      expect(rows()).toHaveLength(2);
      expect(text(rows()[0])).toContain('Cohorte A');
      expect(text(rows()[0])).toContain('COH-A');
      expect(stats()).toEqual({ 'Grupos activos': '2', 'Estudiantes asignados': '3', 'Casos publicados': '2' });
    });

    it('sin grupos: el primer uso va dentro de la tabla, sin cifras y con el formulario a la vista', async () => {
      await render({ listar: () => of([]) });
      expect(text(host().querySelector('.gl-list ui-empty-state'))).toContain('Aún no tienes grupos');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(host().querySelector('.gl-form form')).not.toBeNull();
    });

    it('si falla la carga: UN error con «Reintentar» que vuelve a pedir los grupos, y ninguna cifra', async () => {
      let calls = 0;
      await render({ listar: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([grupoA])) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(host().querySelector('.gl-list ui-empty-state')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(rows()).toHaveLength(1);
    });
  });

  // req: RNF-04, BLOQUE-H, RQ-NEG-006
  describe('acciones de la fila', () => {
    it('cada fila ofrece «Ver detalle», «Ver reporte» y UN menú; ya no hay cinco botones de texto', async () => {
      await render();
      const row = rows()[0];
      const buttons = [...row.querySelectorAll('button, a')];

      const detail = buttons.find(el => text(el) === 'Ver detalle')!;
      expect(detail.getAttribute('aria-label')).toBe('Ver detalle de Cohorte A');
      const report = buttons.find(el => text(el) === 'Ver reporte')!;
      expect(report.getAttribute('href')).toBe('/portal/reportes?grupo=1');
      expect(report.getAttribute('aria-label')).toBe('Ver reporte de Cohorte A');

      expect(row.querySelectorAll('ui-menu')).toHaveLength(1);
      expect(row.querySelector('ui-menu button')?.getAttribute('aria-label')).toBe('Más acciones de Cohorte A');
      for (const label of ['Agregar', 'Invitar', 'Copiar código', 'Editar', 'Borrar']) {
        expect(buttons.some(el => text(el) === label), label).toBe(false);
      }
    });

    it('«Editar» del menú lleva el grupo al formulario; «Borrar» pide confirmar con el diálogo de la biblioteca', async () => {
      await render();
      const menus = fixture.debugElement.queryAll(By.directive(UiMenu));
      expect(menus).toHaveLength(2);

      menus[0].triggerEventHandler('itemSelected', 'editar');
      fixture.detectChanges();
      expect(component().editandoGrupo()).toEqual(grupoA);
      expect(text(host().querySelector('.gl-form h2'))).toBe('Editar grupo');
      expect((host().querySelector('.gl-form input[formControlName="nombre"]') as HTMLInputElement).value).toBe('Cohorte A');

      service['eliminar'].mockReturnValue(of({ id: 2 }));
      menus[1].triggerEventHandler('itemSelected', 'borrar');
      await fixture.whenStable();
      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Borrar grupo', confirmLabel: 'Borrar', tone: 'danger', message: expect.stringContaining('"Cohorte B"'),
      }));
      expect(service['eliminar']).toHaveBeenCalledWith(2);
    });

    it('«Copiar código» del menú copia el código del grupo de ESA fila', async () => {
      await render();
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      try {
        fixture.debugElement.queryAll(By.directive(UiMenu))[1].triggerEventHandler('itemSelected', 'copiar');
        await fixture.whenStable();
        expect(writeText).toHaveBeenCalledWith('COH-B');
      } finally {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      }
    });

    it('buscar filtra por nombre o código; sin coincidencias, «Limpiar búsqueda» la restablece', async () => {
      await render();
      const search = host().querySelector('input[type="search"]') as HTMLInputElement;
      search.value = 'coh-b';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(rows()).toHaveLength(1);
      expect(text(rows()[0])).toContain('Cohorte B');

      search.value = 'zzz';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(rows()).toHaveLength(0);
      const none = host().querySelector('ui-empty-state')!;
      expect(text(none)).toContain('No encontramos grupos con ese criterio');
      (none.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(search.value).toBe('');
      expect(rows()).toHaveLength(2);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('detalle del grupo', () => {
    it('«Ver detalle» abre el grupo con sus estudiantes y casos; quitar nombra a la persona o al caso', async () => {
      await render();
      const detailButton = [...rows()[0].querySelectorAll('button')].find(el => text(el) === 'Ver detalle')!;
      detailButton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(rows()[0].classList.contains('ui-table__row--selected')).toBe(true);
      const detail = host().querySelector('.gl-detail')!;
      expect(text(detail.querySelector('h2'))).toContain('Cohorte A');
      expect(text(detail)).toContain('Marta Ríos');
      expect(text(detail)).toContain('marta@siep.test');
      expect(detail.querySelector('button[aria-label="Quitar a Marta Ríos del grupo"]')).not.toBeNull();
      expect(text(detail)).toContain('Caso doce');
      expect(detail.querySelector('button[aria-label="Retirar «Caso doce» del grupo"]')).not.toBeNull();
    });

    it('ninguna región de la pantalla repite el nombre de otra (landmark-unique): la tabla no se llama como su sección', async () => {
      await render();
      await openDetail();
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThan(3);
      expect(new Set(names).size).toBe(names.length);
    });

    it('sin estudiantes ni casos: dos vacíos que dicen qué hacer, no cifras en cero', async () => {
      await render({ estudiantes: () => of([]), asignaciones: () => of([]) });
      await openDetail();
      const detail = host().querySelector('.gl-detail')!;
      expect(text(detail)).toContain('Este grupo aún no tiene estudiantes.');
      expect(text(detail)).toContain('No hay casos asignados. Los estudiantes no verán casos hasta que asignes uno.');
    });

    // req: RF-14, CU-06 (F10-5)
    it('el detalle cuenta los casos asignados con lo que dice la sección de asignaciones, en singular y en plural', async () => {
      await render();
      await openDetail();
      expect(text(host().querySelector('.gl-detail'))).toContain('1 caso asignado');
      TestBed.resetTestingModule();
      await render({ asignaciones: () => of([asignacion, { ...asignacion, id: 6, caseVersionId: 13 }]) });
      await openDetail();
      expect(text(host().querySelector('.gl-detail'))).toContain('2 casos asignados');
    });

    it('la sección «Casos asignados» es la de asignaciones con ventana y recibe los casos publicados', async () => {
      await render();
      await openDetail();
      const section = host().querySelector('.gl-detail app-group-assignments')!;
      expect(section).not.toBeNull();
      expect(text(section.querySelector('ui-badge'))).toBe('Abierto');
      expect([...section.querySelectorAll('button')].map(el => text(el)).some(label => label.includes('Asignar un caso'))).toBe(true);
      expect(host().querySelector('select[formControlName="caseVersionId"]')).toBeNull();
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('importación de estudiantes', () => {
    function drop(file: File): Event {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
      return event;
    }
    const zone = () => host().querySelector('.gl-drop') as HTMLElement;

    it('el control de archivo nativo sigue en la zona (teclado y lector) y la zona dice que admite arrastrar', async () => {
      await render();
      await openDetail();
      expect(zone().querySelector('input[type="file"]')).not.toBeNull();
      expect(text(zone())).toContain('Arrastra aquí el archivo .xlsx');
    });

    it('soltar un .xlsx lo selecciona; soltar otro tipo lo rechaza con un mensaje', async () => {
      await render();
      await openDetail();
      const good = new File(['x'], 'lista.xlsx');
      zone().dispatchEvent(drop(good));
      fixture.detectChanges();
      expect(component().archivoImportacion()).toBe(good);
      expect(text(zone())).toContain('lista.xlsx');

      zone().dispatchEvent(drop(new File(['x'], 'lista.pdf')));
      fixture.detectChanges();
      expect(component().archivoImportacion()).toBeNull();
      expect(text(host().querySelector('.gl-detail .gl-message'))).toBe('Selecciona un archivo .xlsx.');
    });

    it('arrastrar sobre la zona la resalta y salir de ella lo quita', async () => {
      await render();
      await openDetail();
      zone().dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(zone().classList.contains('gl-drop--active')).toBe(true);

      zone().dispatchEvent(new Event('dragleave', { bubbles: true }));
      fixture.detectChanges();
      expect(zone().classList.contains('gl-drop--active')).toBe(false);
    });

    // E2-9 (RN-10, decisión 4): la importación ya no trae `defaultPassword` (la pantalla imprimía «…: undefined») ni
    // acepta la columna `password`: las cuentas nuevas quedan PENDIENTES y el administrador las aprueba.
    // req: RN-10, RNF-01
    it('el resultado sale una vez y dice cuántas cuentas quedan pendientes de aprobación; nunca una contraseña (gancho RN-10)', async () => {
      await render();
      await openDetail();
      const result = {
        associated: 3, assigned: 3, created: 2, existing: 1, skipped: 0, duplicated: 0, message: 'Importación completada.',
        pendingApproval: 2, ignoredColumns: ['password'], errors: [], students: [], grupo: grupoA,
      } as unknown as GrupoImportResult;
      component().resultadoImportacion.set(result);
      fixture.detectChanges();

      const summary = host().querySelectorAll('.gl-import-result');
      expect(summary).toHaveLength(1);
      expect(text(summary[0])).toContain('3 invitados · 2 cuentas nuevas · 1 ya existían · 0 omitidos');
      expect(text(summary[0]).match(/pendientes de aprobación/g)).toHaveLength(1);
      expect(text(summary[0])).toContain('Las 2 cuentas nuevas quedan pendientes de aprobación');
      expect(text(summary[0])).toContain('Se ignoró la columna «password»');
      expect(text(summary[0])).not.toMatch(/[Cc]ontraseña por defecto|undefined/);
    });

    it('la zona de importación ya no pide ni menciona contraseñas (la plantilla de E2 no tiene esa columna)', async () => {
      await render();
      await openDetail();
      expect(text(zone())).toContain('Columnas requeridas: nombre, apellido, email.');
      expect(text(zone())).not.toMatch(/[Cc]ontraseña|password|Opcionales/);
    });
  });

  // E2-10 (C5, decisión 22): el docente INVITA y el estudiante acepta; de quien no ha aceptado el servidor solo devuelve
  // el correo. `totalEstudiantes` cuenta las membresías activas y `totalInvitados` las pendientes.
  // req: SIEP-RF-04, D-14, RNF-04
  describe('membresías por invitación (E2-10)', () => {
    const laura = { id: 12, nombre: '', apellido: '', email: 'laura@siep.test', role: 'ESTUDIANTE', membershipStatus: 'INVITED' } as GrupoEstudiante;
    const rechazo = { id: 13, nombre: '', apellido: '', email: 'pedro@siep.test', role: 'ESTUDIANTE', membershipStatus: 'DECLINED' } as GrupoEstudiante;
    const activa = { ...marta, membershipStatus: 'ACTIVE' } as GrupoEstudiante;

    it('cada estudiante dice su estado en palabras; de un invitado solo el correo (sin «undefined» ni nombre vacío)', async () => {
      await render({ estudiantes: () => of([activa, laura, rechazo]) });
      await openDetail();
      const people = [...host().querySelectorAll('.gl-people-card .gl-person')];
      expect(people).toHaveLength(3);
      expect(text(people[0])).toContain('Marta Ríos');
      expect(text(people[0].querySelector('ui-badge'))).toBe('Miembro');
      expect(text(people[1].querySelector('strong'))).toBe('laura@siep.test');
      expect(text(people[1].querySelector('ui-badge'))).toBe('Invitación pendiente');
      expect(text(people[2].querySelector('ui-badge'))).toBe('Rechazó la invitación');
      expect(text(host().querySelector('.gl-detail'))).not.toContain('undefined');
      expect(people[1].querySelector('button[aria-label="Cancelar la invitación a laura@siep.test"]')).not.toBeNull();
    });

    it('el detalle cuenta miembros e invitaciones por separado', async () => {
      await render({ estudiantes: () => of([activa, laura]) });
      await openDetail();
      expect(text(host().querySelector('.gl-detail .gl-hint'))).toContain('1 estudiante · 1 invitación pendiente');
    });

    it('las cifras y la tabla separan a los miembros de las invitaciones pendientes', async () => {
      await render({ listar: () => of([{ ...grupoA, totalInvitados: 2 }, grupoB]) });
      expect(stats()).toEqual({ 'Grupos activos': '2', 'Estudiantes asignados': '3', 'Invitaciones pendientes': '2', 'Casos publicados': '2' });
      expect(text(rows()[0].querySelector('.gl-num'))).toBe('3 (2 por aceptar)');
      expect(text(rows()[1].querySelector('.gl-num'))).toBe('0');
    });

    it('«Invitar» por correo: el resultado dice que la persona verá el grupo cuando acepte', async () => {
      await render();
      await openDetail();
      service['agregarEstudiante'].mockReturnValue(of(grupoA));
      component().agregarEstudiante(grupoA);
      fixture.detectChanges();
      component().estudianteForm.setValue({ email: 'nuevo@siep.test' });
      component().confirmarAgregar();
      fixture.detectChanges();
      expect(component().mensajeEstudiante()).toBe('Si nuevo@siep.test es de un estudiante registrado, recibirá la invitación y verá el grupo cuando la acepte.');
      const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
      expect(menu.items().map(item => item.label)).toContain('Invitar estudiante');
    });
  });

  // req: RNF-04, BLOQUE-H (revisión de F7)
  describe('arreglos de la revisión de F7', () => {
    it('«Casos publicados» no muestra un 0 falso mientras los casos no han respondido', async () => {
      const pending = new Subject<SimulationCaseSummary[]>();
      await render({ casosPublicados: () => pending });
      expect(stats()['Grupos activos']).toBe('2');
      expect(stats()['Casos publicados']).toBeUndefined();

      pending.next([caso, otroCaso]);
      pending.complete();
      fixture.detectChanges();
      expect(stats()['Casos publicados']).toBe('2');
    });

    it('si los casos no cargan, esa cifra no aparece (en vez de un 0 que parece verdad)', async () => {
      await render({ casosPublicados: () => throwError(() => new Error('HTTP 500')) });
      expect(stats()['Grupos activos']).toBe('2');
      expect(stats()['Casos publicados']).toBeUndefined();
    });

    it('un refresco silencioso que falla conserva la lista y avisa, no la reemplaza por un error', async () => {
      await render();
      service['listar'].mockReturnValue(throwError(() => new Error('HTTP 500')));

      component().cargar(true);
      fixture.detectChanges();

      expect(rows()).toHaveLength(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(notify.warning).toHaveBeenCalledWith('No pudimos actualizar la lista de grupos.');
    });

    it('agregar un estudiante con el correo vacío o inválido lleva el foco al campo', async () => {
      await render();
      document.body.appendChild(host());
      try {
        component().agregarEstudiante(grupoA);
        await fixture.whenStable();
        fixture.detectChanges();
        const input = host().querySelector('.gl-add input[type="email"]') as HTMLInputElement;
        const form = host().querySelector('.gl-add') as HTMLFormElement;

        form.dispatchEvent(new Event('submit', { cancelable: true }));
        fixture.detectChanges();

        expect(text(host().querySelector('.gl-add .ui-field__message--error'))).toBe('Escribe un correo válido.');
        expect(document.activeElement).toBe(input);
      } finally {
        host().remove();
      }
    });

    it('el mensaje de la importación se anuncia en la región de estado de la pantalla', async () => {
      await render();
      await openDetail();
      component().mensajeEstudiante.set('Importación completada: 3 asignados.');
      fixture.detectChanges();

      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Importación completada: 3 asignados.');
      expect(text(host().querySelector('.gl-detail .gl-message'))).toBe('Importación completada: 3 asignados.');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('sin restos del diseño anterior', () => {
    it('ni Material ni los botones de texto en línea', async () => {
      await render();
      await openDetail();
      expect(host().querySelector('mat-card, mat-form-field, mat-progress-bar, mat-select, .text-action, .psy-button')).toBeNull();
      expect(host().querySelector('app-confirm-dialog')).toBeNull();
    });
  });
});
