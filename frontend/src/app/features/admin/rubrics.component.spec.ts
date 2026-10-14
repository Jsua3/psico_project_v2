import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { HttpErrorResponse } from '@angular/common/http';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationService } from '../../core/api/simulation.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { RubricsComponent } from './rubrics.component';

/**
 * Pantalla Rúbricas en el sistema de la biblioteca (plan visual F7-5): campos `ui-field`, esqueleto, error con
 * «Reintentar», lista vacía con su acción, «Activar» con el motivo por el que no se puede (la ponderación debe sumar
 * 100 %), «Guardando…» mientras guarda y regiones con nombres distintos. La lógica de cada acción vive en las specs de
 * comportamiento (`rubrics.feedback.spec.ts`, `rubrics.validation.spec.ts`).
 */
const rubric = (id: number, name: string, weights: number[], overrides: Partial<RubricAdmin> = {}): RubricAdmin => ({
  id, name, description: null, active: false, version: '1.0', isDefault: false,
  totalWeight: weights.reduce((sum, weight) => sum + weight, 0), criteriaCount: weights.length,
  criteria: weights.map((weight, index) => ({ id: id * 10 + index, title: `Criterio ${index + 1}`, weight, displayOrder: index + 1, active: true })),
  ...overrides,
} as RubricAdmin);

const completa = rubric(4, 'Entrevista inicial', [60, 40], { active: true, isDefault: true });
const incompleta = rubric(7, 'Observación de aula', [60, 30]);
const caso = { caseVersionId: 3, code: 'CASO-3', title: 'Caso tres', semanticVersion: '1.2.0' } as SimulationCaseSummary;

interface Api {
  list: () => Observable<RubricAdmin[]>;
  detail: (id: number) => Observable<RubricAdmin>;
}

describe('pantalla Rúbricas (F7-5)', () => {
  let fixture: ComponentFixture<RubricsComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => [...host().querySelectorAll('.rb-row')];
  const component = () => fixture.componentInstance;
  /** Un botón por su rótulo visible (sin la ligadura de su icono, que es decorativa). */
  const buttonLabelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label) as HTMLButtonElement | undefined;
  const reasonOf = (button: HTMLButtonElement | undefined) => {
    const id = (button?.getAttribute('aria-describedby') ?? '').split(' ').find(Boolean);
    return id ? text(host().querySelector(`#${id}`)) : '';
  };

  async function render(api: Partial<Api> = {}, { stable = true, role = 'ADMIN' } = {}) {
    service = {
      list: vi.fn(api.list ?? (() => of([completa, incompleta]))),
      detail: vi.fn(api.detail ?? ((id: number) => of(id === 7 ? incompleta : completa))),
      create: vi.fn(), update: vi.fn(), activate: vi.fn(), deactivate: vi.fn(), duplicate: vi.fn(), setDefault: vi.fn(),
      assignToCaseVersion: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [RubricsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: RubricService, useValue: service },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
        { provide: SimulationService, useValue: { listCases: vi.fn(() => of([caso])) } },
        { provide: NotificationService, useValue: notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(RubricsComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // E2-2: rúbricas con dueño. El docente edita solo las suyas (la global y las de otros son de solo lectura: 403 al
  // guardar, «se duplica para personalizarla»), la de otro docente no existe para él (404) y solo el administrador fija
  // la predeterminada. Antes la pantalla ofrecía todo a todos y cada 403 decía «No tienes permisos…».
  // req: SIEP-CU-04, RNF-002
  describe('rúbricas con dueño (E2-2)', () => {
    const http = (status: number) => () => throwError(() => new HttpErrorResponse({ status, error: { success: false, message: 'x' } }));

    it('solo el administrador ve «Predeterminada»', async () => {
      await render();
      expect(buttonLabelled('Predeterminada')).toBeDefined();
      TestBed.resetTestingModule();
      await render({}, { role: 'PROFESOR' });
      expect(buttonLabelled('Predeterminada')).toBeUndefined();
      expect(buttonLabelled('Duplicar')).toBeDefined();
    });

    it('guardar una rúbrica ajena (403) explica que es de solo lectura y ofrece duplicarla para personalizarla', async () => {
      await render({}, { role: 'PROFESOR' });
      service['update'].mockImplementation(http(403));
      service['duplicate'].mockReturnValue(of(rubric(9, 'Copia de Entrevista inicial', [60, 40])));
      buttonLabelled('Guardar')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');
      expect(notify.error).not.toHaveBeenCalledWith(expect.stringContaining('No tienes permisos'));
      buttonLabelled('Duplicar para personalizar')!.click();
      await fixture.whenStable();
      expect(service['duplicate']).toHaveBeenCalledWith(4);
    });

    it('activar una ajena (403) también lo explica', async () => {
      await render({}, { role: 'PROFESOR' });
      service['deactivate'].mockImplementation(http(403));
      buttonLabelled('Desactivar')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');
    });

    it('asignar a un caso que no creó (403) dice que solo quien creó el caso puede asignarle una rúbrica', async () => {
      await render({}, { role: 'PROFESOR' });
      service['assignToCaseVersion'].mockImplementation(http(403));
      component().selectCaseVersion('3');
      fixture.detectChanges();
      buttonLabelled('Asignar')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(notify.error).toHaveBeenCalledWith('Solo quien creó el caso puede asignarle una rúbrica.');
    });

    it('una rúbrica que ya no está disponible (404) lo dice y la lista se vuelve a pedir', async () => {
      await render({}, { role: 'PROFESOR' });
      service['update'].mockImplementation(http(404));
      buttonLabelled('Guardar')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Esta rúbrica ya no está disponible.');
      expect(service['list']).toHaveBeenCalledTimes(2);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('un solo h1 «Rúbricas», la región de estado siempre presente y «Nueva rúbrica» en la cabecera', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Rúbricas');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect(buttonLabelled('Nueva rúbrica')).toBeDefined();
    });

    it('con rúbricas: una fila por rúbrica con su estado en una insignia, y la primera abierta', async () => {
      await render();
      expect(rows()).toHaveLength(2);
      expect(text(rows()[0].querySelector('ui-badge'))).toBe('Predeterminada');
      expect(text(rows()[1].querySelector('ui-badge'))).toBe('Inactiva');
      expect(text(rows()[1])).toContain('2 criterios · 90 %');
      expect(rows()[0].getAttribute('aria-current')).toBe('true');
      expect(rows()[1].getAttribute('aria-current')).toBeNull();
    });

    it('en el primer instante de la carga (antes del esqueleto) no pinta «sin resultados» ni ningún vacío', async () => {
      const pending = new Subject<RubricAdmin[]>();
      await render({ list: () => pending }, { stable: false });

      expect(host().querySelector('.rb-list ui-empty-state')).toBeNull();
      expect(rows()).toHaveLength(0);
    });

    it('si no se puede abrir una rúbrica, el aviso queda junto al formulario y se anuncia en la región de estado', async () => {
      let calls = 0;
      await render({ detail: id => (++calls === 1 ? of(id === 7 ? incompleta : completa) : throwError(() => new Error('HTTP 500'))) });
      (rows()[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.rb-form .rb-message--error'))).toBe('No fue posible abrir la rúbrica.');
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('No fue posible abrir la rúbrica.');
    });

    it('mientras carga: esqueleto con aria-busy, el estado leído y ninguna fila', async () => {
      vi.useFakeTimers();
      const pending = new Subject<RubricAdmin[]>();
      await render({ list: () => pending }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('.rb-list ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelector('.rb-list [aria-busy="true"]')).not.toBeNull();
      expect(rows()).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando rúbricas…');
    });

    it('si la lista falla: UN error con «Reintentar» que la vuelve a pedir', async () => {
      let calls = 0;
      await render({ list: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([completa])) });
      const errors = host().querySelectorAll('.rb-list ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No fue posible cargar las rúbricas.');

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('.rb-list ui-error-state')).toBeNull();
      expect(rows()).toHaveLength(1);
    });

    it('sin rúbricas: lista vacía con su acción «Nueva rúbrica», que abre el formulario en blanco', async () => {
      await render({ list: () => of([]) });
      const empty = host().querySelector('.rb-list ui-empty-state')!;
      expect(text(empty)).toContain('Aún no hay rúbricas');
      const action = [...empty.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Nueva rúbrica')!;
      action.click();
      fixture.detectChanges();

      expect(component().selected()).toBeNull();
      expect(host().querySelectorAll('.criterion')).toHaveLength(1);
    });

    it('un filtro sin coincidencias dice «Sin resultados» y «Limpiar filtros» lo restablece', async () => {
      await render();
      const search = host().querySelector('.rb-filters input[type="search"]') as HTMLInputElement;
      search.value = 'zzz';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(rows()).toHaveLength(0);
      const none = host().querySelector('.rb-list ui-empty-state')!;
      expect(text(none)).toContain('No hay rúbricas con ese filtro');
      (none.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(search.value).toBe('');
      expect(rows()).toHaveLength(2);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('acciones y regla del 100 %', () => {
    it('con la ponderación en 100: «Activar» y «Predeterminada» disponibles y sin motivo', async () => {
      await render();
      for (const label of ['Activar', 'Predeterminada']) {
        const button = buttonLabelled(label)!;
        expect(button.getAttribute('aria-disabled'), label).toBeNull();
      }
      expect(host().querySelector('#rubric-weight-hint')).toBeNull();
      expect(text(host().querySelector('.rb-weight'))).toContain('100 %');
    });

    it('con la ponderación distinta de 100: la pista se ve y los dos botones dicen POR QUÉ no se puede', async () => {
      await render({ detail: () => of(incompleta) });
      expect(text(host().querySelector('#rubric-weight-hint'))).toBe('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
      for (const label of ['Activar', 'Predeterminada']) {
        const button = buttonLabelled(label)!;
        expect(button.getAttribute('aria-disabled'), label).toBe('true');
        expect(reasonOf(button), label).toBe('La ponderación debe sumar 100 %.');
      }
    });

    it('sin una rúbrica abierta, los botones que la necesitan explican que hay que guardar primero', async () => {
      await render({ list: () => of([]) });
      component().newRubric();
      fixture.detectChanges();
      expect(buttonLabelled('Duplicar')!.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(buttonLabelled('Duplicar'))).toBe('Guarda la rúbrica primero.');
      expect(reasonOf(buttonLabelled('Desactivar'))).toBe('Guarda la rúbrica primero.');
    });

    it('«Asignar» pide elegir una simulación y se habilita al elegirla', async () => {
      await render();
      expect(buttonLabelled('Asignar')!.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(buttonLabelled('Asignar'))).toBe('Elige una simulación publicada.');

      const select = host().querySelector('.rb-assign select') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(buttonLabelled('Asignar')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('mientras guarda el botón dice «Guardando…» y queda ocupado', async () => {
      await render();
      component().saving.set(true);
      fixture.detectChanges();

      const save = [...host().querySelectorAll('button[type="submit"]')][0] as HTMLButtonElement;
      expect(text(save.querySelector('.ui-button__label'))).toBe('Guardando…');
      expect(save.getAttribute('aria-disabled')).toBe('true');
      expect(save.getAttribute('aria-busy')).toBe('true');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estructura', () => {
    it('ninguna región repite el nombre de otra y no quedan restos de Material', async () => {
      await render();
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThan(2);
      expect(new Set(names).size).toBe(names.length);
      expect(host().querySelector('mat-card, mat-form-field, mat-select, mat-progress-bar, .psy-button, .mat-mdc-button')).toBeNull();
    });
  });
});
