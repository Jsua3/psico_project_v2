import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { CaseLifecycle, CaseValidation } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { CaseReviewPanelComponent } from './case-review-panel.component';

/**
 * Panel «Revisión» del editor de casos (plan visual F10-6†; RF-12, RF-13, CU-05; contratos C4 ciclo de vida y C6
 * validación): qué falta para publicar con enlace a la escena o al mapa, y los controles de estado con confirmación.
 * Lo que el servidor permite (`allowedTransitions`) manda: la pantalla no calcula permisos.
 */
const DRAFT: CaseLifecycle = { caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit', 'archive'] };
const OK: CaseValidation = { issues: [], canPublish: true };
const WITH_ISSUES: CaseValidation = {
  canPublish: false,
  issues: [
    { code: 'WORLD.NODE_WITHOUT_MAP', severity: 'error', message: 'La escena «Sala de espera» no tiene mapa: no se podría explorar.', nodeId: 4 },
    { code: 'WORLD.SPAWN_OUT_OF_BOUNDS', severity: 'error', message: 'El punto de aparición del mapa «Triage» queda fuera de sus límites.', mapId: 7 },
    { code: 'WORLD.NO_SAFE_EXIT', severity: 'warning', message: 'El caso necesita una salida segura: agrega un objeto de tipo salida (EXIT).' },
  ],
};

function http(status: number, body: Record<string, unknown>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, ...body } });
}

describe('CaseReviewPanelComponent', () => {
  let fixture: ComponentFixture<CaseReviewPanelComponent>;
  let component: CaseReviewPanelComponent;
  let api: {
    lifecycle: ReturnType<typeof vi.fn>;
    validateCase: ReturnType<typeof vi.fn>;
    transitionCase: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;
  let decide: ReturnType<typeof vi.fn>;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let changed: ReturnType<typeof vi.fn>;
  let opened: Array<{ nodeId?: number; mapId?: number }>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');
  /** Deja correr todas las promesas pendientes (confirmación, diálogo, respuesta) antes de mirar el resultado. */
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const buttonNamed = (name: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(button => (button.textContent ?? '').replace(/\s+/g, ' ').trim().includes(name));
  const render = () => fixture.detectChanges();

  const setup = (lifecycle: CaseLifecycle | Observable<CaseLifecycle> = DRAFT, validation: CaseValidation = WITH_ISSUES) => {
    api = {
      lifecycle: vi.fn(() => (lifecycle instanceof Observable ? lifecycle : of(lifecycle))),
      validateCase: vi.fn(() => of(validation)),
      transitionCase: vi.fn(() => of({ ...DRAFT, state: 'IN_REVIEW', allowedTransitions: [] } as CaseLifecycle)),
    };
    confirm = vi.fn(() => Promise.resolve(true));
    decide = vi.fn(() => ({ closed: of({ note: 'Falta contexto', reason: 'FORMA' }) }));
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    changed = vi.fn();
    opened = [];
    TestBed.configureTestingModule({
      imports: [CaseReviewPanelComponent],
      providers: [
        { provide: AuthoringApi, useValue: api },
        { provide: UiDialog, useValue: { confirm, open: decide } },
        { provide: NotificationService, useValue: notify },
      ],
    });
    fixture = TestBed.createComponent(CaseReviewPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('caseVersionId', 9);
    fixture.componentRef.setInput('revision', 5);
    component.changed.subscribe(changed as never);
    component.issueOpen.subscribe(target => opened.push(target));
    render();
  };

  // req: RF-12, RF-13, CU-05
  describe('estado y transiciones', () => {
    it('lee el ciclo de vida y la validación al abrirse y dice el estado con su nombre humano', () => {
      setup();

      expect(api.lifecycle).toHaveBeenCalledWith(9);
      expect(api.validateCase).toHaveBeenCalledWith(9);
      expect(text()).toContain('Borrador');
      expect(text()).not.toContain('DRAFT');
    });

    it('ofrece solo lo que el servidor permite, con nombre de acción (nunca el código crudo)', () => {
      setup({ ...DRAFT, allowedTransitions: ['submit', 'archive', 'clone'] });

      expect(buttonNamed('Enviar a revisión')).toBeDefined();
      expect(buttonNamed('Archivar')).toBeDefined();
      expect(buttonNamed('Aprobar')).toBeUndefined();
      expect(buttonNamed('Devolver')).toBeUndefined();
      expect(text()).not.toMatch(/\bsubmit\b|\bapprove\b|\barchive\b/);
    });

    it('una persona con permiso de revisar ve aprobar y devolver', () => {
      setup({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] });

      expect(text()).toContain('En revisión');
      expect(buttonNamed('Aprobar y publicar')).toBeDefined();
      expect(buttonNamed('Devolver a borrador')).toBeDefined();
    });

    it('con un motivo de bloqueo, «Enviar a revisión» queda aria-disabled con ese motivo y no llama al servidor', async () => {
      setup({ ...DRAFT, blockedReason: { code: 'CHECKLIST_INCOMPLETE', message: 'El checklist debe estar al 100 %.' } });
      const submit = buttonNamed('Enviar a revisión')!;

      expect(submit.getAttribute('aria-disabled')).toBe('true');
      expect(submit.getAttribute('aria-describedby')).toBeTruthy();
      expect(el().querySelector(`#${submit.getAttribute('aria-describedby')}`)?.textContent).toContain('El checklist debe estar al 100 %.');
      submit.click();
      await settle();
      expect(confirm).not.toHaveBeenCalled();
      expect(api.transitionCase).not.toHaveBeenCalled();
    });

    it('enviar a revisión pide confirmar, manda la revisión del editor, avisa y pide recargar el editor', async () => {
      setup();

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enviar a revisión', confirmLabel: 'Enviar' }));
      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'submit' }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso se envió a revisión.');
      expect(changed).toHaveBeenCalledTimes(1);
      // El ciclo que devuelve la transición ya es el estado: no hace falta otra lectura.
      expect(api.lifecycle).toHaveBeenCalledTimes(1);
      expect(text()).toContain('En revisión');
      expect(buttonNamed('Enviar a revisión')).toBeUndefined();
    });

    it('aprobar y publicar manda la nota y la constancia que se escribieron en el diálogo', async () => {
      setup({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] });
      const contentReview = { reviewer: 'Dra. Ruiz', reviewedOn: '2026-10-10', reference: 'Acta 4' };
      decide.mockReturnValueOnce({ closed: of({ note: 'Cumple', contentReview }) });

      buttonNamed('Aprobar y publicar')!.click();
      await settle();

      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'approve', note: 'Cumple', contentReview }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso se publicó.');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('si el servidor exige la constancia, el siguiente intento de aprobar la pide como obligatoria', async () => {
      setup({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] });
      api.transitionCase.mockReturnValueOnce(throwError(() => http(400, { code: 'CONTENT_REVIEW_REQUIRED', message: 'Falta la constancia.' })));
      decide.mockReturnValue({ closed: of({}) });

      buttonNamed('Aprobar y publicar')!.click();
      await settle();
      buttonNamed('Aprobar y publicar')!.click();
      await settle();

      expect(decide.mock.calls[0][1]).toMatchObject({ data: { mode: 'approve', contentReviewRequired: false } });
      expect(decide.mock.calls[1][1]).toMatchObject({ data: { mode: 'approve', contentReviewRequired: true } });
    });

    it('si se cancela la confirmación no pasa nada', async () => {
      setup();
      confirm.mockResolvedValueOnce(false);

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(api.transitionCase).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });

    it('devolver a borrador lleva el motivo y la nota que se escribieron en el diálogo', async () => {
      setup({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] });

      buttonNamed('Devolver a borrador')!.click();
      await settle();

      expect(decide).toHaveBeenCalled();
      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'reject', reason: 'FORMA', note: 'Falta contexto' }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso volvió a borrador.');
    });

    it('si se cierra el diálogo de decisión sin responder no se manda nada', async () => {
      setup({ caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] });
      decide.mockReturnValueOnce({ closed: of(undefined) });

      buttonNamed('Aprobar y publicar')!.click();
      await settle();

      expect(api.transitionCase).not.toHaveBeenCalled();
    });

    it('archivar confirma con el tono de peligro y dice qué pasa', async () => {
      setup();

      buttonNamed('Archivar')!.click();
      await settle();

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', confirmLabel: 'Archivar' }));
      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'archive', scope: 'version' }, 5);
    });
  });

  // req: RF-12, CU-05
  describe('validación: qué falta y a dónde ir', () => {
    it('lista cada hallazgo con su gravedad en palabras y un resumen de cuántas cosas faltan', () => {
      setup();

      expect(text()).toContain('Faltan 2 cosas por corregir');
      expect(text()).toContain('1 aviso');
      expect(text()).toContain('La escena «Sala de espera» no tiene mapa');
      expect(text()).toContain('Error');
      expect(text()).toContain('Aviso');
      expect(text()).not.toMatch(/WORLD\./);
    });

    it('sin hallazgos dice que no hay errores de validación', () => {
      setup(DRAFT, OK);

      expect(text()).toContain('Sin errores de validación');
    });

    it('«Ir a la escena» y «Ir al mapa» le dicen a la pantalla a qué elemento llevar al autor', () => {
      setup();

      buttonNamed('Ir a la escena')!.click();
      buttonNamed('Ir al mapa')!.click();

      expect(opened).toEqual([{ nodeId: 4 }, { mapId: 7 }]);
    });

    it('si el caso ya no admite cambios, los hallazgos se leen pero sin enlace a la escena ni al mapa', () => {
      setup();
      fixture.componentRef.setInput('editable', false);
      render();

      expect(buttonNamed('Ir a la escena')).toBeUndefined();
      expect(buttonNamed('Ir al mapa')).toBeUndefined();
      expect(text()).toContain('La escena «Sala de espera» no tiene mapa');
    });

    it('un hallazgo sin escena ni mapa no ofrece enlace', () => {
      setup(DRAFT, { canPublish: false, issues: [WITH_ISSUES.issues[2]] });

      expect(buttonNamed('Ir a la escena')).toBeUndefined();
      expect(buttonNamed('Ir al mapa')).toBeUndefined();
    });

    it('«Revisar de nuevo» vuelve a pedir la validación y anuncia el resultado en la región de estado', () => {
      setup();
      api.validateCase.mockReturnValueOnce(of(OK));

      buttonNamed('Revisar de nuevo')!.click();
      render();

      expect(api.validateCase).toHaveBeenCalledTimes(2);
      expect(el().querySelector('[role="status"]')?.textContent).toContain('Sin errores de validación');
    });
  });

  // req: RF-13, RNF-08, REGLA-011
  describe('errores', () => {
    it('un 409 CASE_NOT_PUBLISHABLE muestra lo que lo impide (los bloqueos del servidor), no un error genérico', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(throwError(() => http(409, {
        code: 'CASE_NOT_PUBLISHABLE', message: 'El checklist debe estar al 100 %.',
        blockers: [
          { code: 'CHECKLIST_INCOMPLETE', message: 'El checklist debe estar al 100 %.' },
          { code: 'VALIDATION_ERRORS', message: 'El caso tiene 2 error(es) de validación.' },
        ],
      })));

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();

      const alert = el().querySelector('[role="alert"]')!;
      expect(alert.textContent).toContain('El checklist debe estar al 100 %.');
      expect(alert.textContent).toContain('El caso tiene 2 error(es) de validación.');
      expect(changed).not.toHaveBeenCalled();
    });

    it('un 409 REVISION_CONFLICT dice que el caso cambió y pide recargar el editor (la revisión que se mandó ya no sirve)', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(throwError(() => http(409, { code: 'REVISION_CONFLICT', message: 'otra sesión', revision: 9 })));

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('cambió en otra sesión'));
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('cualquier otro error muestra el mensaje del servidor', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(throwError(() => http(400, { code: 'CONTENT_REVIEW_REQUIRED', message: 'Falta la constancia de revisión.' })));

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(notify.error).toHaveBeenCalledWith('Falta la constancia de revisión.');
    });

    it('si no carga el ciclo de vida lo dice y deja reintentar', () => {
      setup(throwError(() => http(500, { code: 'SERVER' })));

      expect(el().querySelector('ui-error-state')).not.toBeNull();
    });

    it('mientras una transición está en curso los botones quedan bloqueados (no hay doble envío)', async () => {
      setup();
      const pending = new Subject<CaseLifecycle>();
      api.transitionCase.mockReturnValueOnce(pending);

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();

      expect(buttonNamed('Archivar')!.getAttribute('aria-disabled')).toBe('true');
      pending.next({ ...DRAFT, state: 'IN_REVIEW', allowedTransitions: [] });
      pending.complete();
    });
  });

  // req: RF-12
  it('la región de estado SIEMPRE existe', () => {
    setup(new Subject<CaseLifecycle>());

    expect(el().querySelector('p[role="status"]')).not.toBeNull();
    expect(component).toBeTruthy();
  });

  // req: RF-13
  it('muestra la última revisión: quién la pidió, qué se decidió y la nota', () => {
    setup({
      caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit'],
      review: { requestedBy: 'Ana Gómez', requestedAt: '2026-10-10T10:00:00', decision: 'REJECTED', decidedBy: 'Luis Peña', decidedAt: '2026-10-11T09:00:00', note: 'Falta contexto', reason: 'FORMA' },
    });

    expect(text()).toContain('Luis Peña');
    expect(text()).toContain('Falta contexto');
    expect(text()).toContain('Forma');
  });
});
