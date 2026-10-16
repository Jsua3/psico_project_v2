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
const IN_REVIEW: CaseLifecycle = { caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: ['approve', 'reject'] };

function http(status: number, body: Record<string, unknown>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { success: false, ...body } });
}

describe('CaseReviewPanelComponent', () => {
  let fixture: ComponentFixture<CaseReviewPanelComponent>;
  let api: {
    lifecycle: ReturnType<typeof vi.fn>;
    validateCase: ReturnType<typeof vi.fn>;
    transitionCase: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;
  let decide: ReturnType<typeof vi.fn>;
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
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
    fixture.componentRef.setInput('caseVersionId', 9);
    fixture.componentRef.setInput('revision', 5);
    fixture.componentInstance.issueOpen.subscribe(target => opened.push(target));
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
      setup(IN_REVIEW);

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

    it('enviar a revisión pide confirmar, manda la revisión del editor, avisa y el ciclo devuelto ya es el estado', async () => {
      setup();

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Enviar a revisión', confirmLabel: 'Enviar' }));
      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'submit' }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso se envió a revisión.');
      // El ciclo que devuelve la transición ya es el estado: no hace falta otra lectura.
      expect(api.lifecycle).toHaveBeenCalledTimes(1);
      expect(text()).toContain('En revisión');
      expect(buttonNamed('Enviar a revisión')).toBeUndefined();
    });

    it('tras la transición el foco va a la descripción del estado nuevo (el botón pulsado ya no está)', async () => {
      setup();

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();
      await settle();

      const help = el().querySelector<HTMLElement>('.rv-lead')!;
      expect(document.activeElement).toBe(help);
      expect(help.textContent).toContain('Está en revisión');
    });

    it('si se cancela la confirmación no pasa nada', async () => {
      setup();
      confirm.mockResolvedValueOnce(false);

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(api.transitionCase).not.toHaveBeenCalled();
    });

    it('devolver a borrador lleva el motivo y la nota que se escribieron en el diálogo', async () => {
      setup(IN_REVIEW);

      buttonNamed('Devolver a borrador')!.click();
      await settle();

      expect(decide).toHaveBeenCalled();
      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'reject', reason: 'FORMA', note: 'Falta contexto' }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso volvió a borrador.');
    });

    it('aprobar y publicar manda la nota y la constancia que se escribieron en el diálogo', async () => {
      setup(IN_REVIEW);
      const contentReview = { reviewer: 'Dra. Ruiz', reviewedOn: '2026-10-10', reference: 'Acta 4' };
      decide.mockReturnValueOnce({ closed: of({ note: 'Cumple', contentReview }) });

      buttonNamed('Aprobar y publicar')!.click();
      await settle();

      expect(api.transitionCase).toHaveBeenCalledWith(9, { action: 'approve', note: 'Cumple', contentReview }, 5);
      expect(notify.success).toHaveBeenCalledWith('El caso se publicó.');
    });

    it('si se cierra el diálogo de decisión sin responder no se manda nada', async () => {
      setup(IN_REVIEW);
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

  // req: RF-13
  describe('la transición no depende de que el panel siga vivo', () => {
    it('si la pestaña se cierra durante la petición (el panel se destruye), el servidor ya la recibió: el aviso sale igual y no hay error', async () => {
      setup();
      const inFlight = new Subject<CaseLifecycle>();
      api.transitionCase.mockReturnValueOnce(inFlight);

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      expect(api.transitionCase).toHaveBeenCalledTimes(1);
      fixture.destroy();

      expect(() => inFlight.next({ ...DRAFT, state: 'IN_REVIEW', allowedTransitions: [] })).not.toThrow();
      expect(notify.success).toHaveBeenCalledWith('El caso se envió a revisión.');
    });

    it('un error de la petición con el panel ya destruido también se dice (y no rompe nada)', async () => {
      setup();
      const inFlight = new Subject<CaseLifecycle>();
      api.transitionCase.mockReturnValueOnce(inFlight);

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      fixture.destroy();

      expect(() => inFlight.error(http(400, { code: 'VALIDATION_ERROR', message: 'La nota es obligatoria.' }))).not.toThrow();
      expect(notify.error).toHaveBeenCalledWith('La nota es obligatoria.');
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

    it('«Revisar de nuevo» también relee el estado: un bloqueo que ya se resolvió desaparece y «Enviar a revisión» se habilita', () => {
      setup({ ...DRAFT, blockedReason: { code: 'VALIDATION_ERRORS', message: 'El caso tiene 2 error(es) de validación.' } });
      expect(text()).toContain('Falta para avanzar');
      expect(buttonNamed('Enviar a revisión')!.getAttribute('aria-disabled')).toBe('true');
      api.lifecycle.mockReturnValueOnce(of(DRAFT));
      api.validateCase.mockReturnValueOnce(of(OK));

      buttonNamed('Revisar de nuevo')!.click();
      render();

      expect(api.lifecycle).toHaveBeenCalledTimes(2);
      expect(text()).not.toContain('Falta para avanzar');
      expect(buttonNamed('Enviar a revisión')!.getAttribute('aria-disabled')).toBeNull();
    });
  });

  // req: RF-12
  describe('se pone al día cuando cambia el caso', () => {
    it('al cambiar la revisión del editor (se guardó algo en otra parte) relee el estado y la validación SIN volver al esqueleto', () => {
      setup();
      const reading = new Subject<CaseLifecycle>();
      api.lifecycle.mockReturnValueOnce(reading);

      fixture.componentRef.setInput('revision', 6);
      render();

      expect(api.lifecycle).toHaveBeenCalledTimes(2);
      expect(el().querySelector('.rv-loading')).toBeNull();
      expect(text()).toContain('Borrador');
    });

    it('un fallo al releer en silencio no borra lo que se veía: solo avisa', () => {
      setup();
      api.lifecycle.mockReturnValueOnce(throwError(() => http(500, { code: 'SERVER' })));

      fixture.componentRef.setInput('revision', 6);
      render();

      expect(el().querySelector('ui-error-state')).toBeNull();
      expect(text()).toContain('Borrador');
      expect(notify.error).toHaveBeenCalledWith('No fue posible actualizar la revisión del caso.');
    });
  });

  // req: RF-13, RNF-08, REGLA-011
  describe('errores', () => {
    it('un 409 CASE_NOT_PUBLISHABLE muestra lo que lo impide (los bloqueos del servidor) y lo anuncia en la región de estado', async () => {
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

      const block = el().querySelector('.rv-blockers')!;
      expect(block.textContent).toContain('El checklist debe estar al 100 %.');
      expect(block.textContent).toContain('El caso tiene 2 error(es) de validación.');
      // La región viva ya existía: lo que impide avanzar se anuncia ahí (un `alert` que nace con su texto no se anuncia).
      expect(el().querySelector('[role="alert"]')).toBeNull();
      expect(el().querySelector('[role="status"]')?.textContent).toContain('El caso tiene 2 error(es) de validación.');
    });

    it('un 409 REVISION_CONFLICT dice que el caso cambió (la revisión que se mandó ya no sirve)', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(throwError(() => http(409, { code: 'REVISION_CONFLICT', message: 'otra sesión', revision: 9 })));

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('cambió en otra sesión'));
    });

    it('un 409 INVALID_TRANSITION (otra pestaña ya cambió el estado) se dice en palabras, sin el código del estado, y relee', async () => {
      setup(IN_REVIEW);
      api.transitionCase.mockReturnValueOnce(throwError(() => http(409, {
        code: 'INVALID_TRANSITION', message: 'No se puede aplicar «approve» a una versión en estado PUBLISHED.', state: 'PUBLISHED', action: 'approve',
      })));
      api.lifecycle.mockReturnValueOnce(of({ caseVersionId: 9, state: 'PUBLISHED', allowedTransitions: ['archive'] } as CaseLifecycle));

      buttonNamed('Aprobar y publicar')!.click();
      await settle();
      render();

      expect(notify.error).toHaveBeenCalledWith('El caso ya cambió de estado desde otra pestaña o sesión: se actualizó lo que ves.');
      expect(JSON.stringify(notify.error.mock.calls)).not.toMatch(/PUBLISHED|approve/);
      expect(api.lifecycle).toHaveBeenCalledTimes(2);
      expect(text()).toContain('Publicado');
      expect(buttonNamed('Aprobar y publicar')).toBeUndefined();
    });

    it('cualquier otro error muestra el mensaje del servidor', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(throwError(() => http(400, { code: 'VALIDATION_ERROR', message: 'La nota es obligatoria.' })));

      buttonNamed('Enviar a revisión')!.click();
      await settle();

      expect(notify.error).toHaveBeenCalledWith('La nota es obligatoria.');
    });

    it('si el servidor exige la constancia, el siguiente intento de aprobar la pide como obligatoria', async () => {
      setup(IN_REVIEW);
      api.transitionCase.mockReturnValueOnce(throwError(() => http(400, { code: 'CONTENT_REVIEW_REQUIRED', message: 'Falta la constancia.' })));
      decide.mockReturnValue({ closed: of({}) });

      buttonNamed('Aprobar y publicar')!.click();
      await settle();
      buttonNamed('Aprobar y publicar')!.click();
      await settle();

      expect(decide.mock.calls[0][1]).toMatchObject({ data: { mode: 'approve', contentReviewRequired: false } });
      expect(decide.mock.calls[1][1]).toMatchObject({ data: { mode: 'approve', contentReviewRequired: true } });
    });

    it('lo que se escribió en el diálogo no se pierde si el servidor rechaza: al reabrirlo llega como borrador; al cancelar se olvida', async () => {
      setup(IN_REVIEW);
      const typed = { note: 'Cumple con todo.', contentReview: { reviewer: 'Dra. Ruiz', reviewedOn: '2026-10-10', reference: 'Acta 4' } };
      api.transitionCase.mockReturnValueOnce(throwError(() => http(400, { code: 'CONTENT_REVIEW_REQUIRED', message: 'Falta la constancia.' })));
      decide.mockReturnValueOnce({ closed: of(typed) }).mockReturnValueOnce({ closed: of(undefined) }).mockReturnValueOnce({ closed: of({}) });

      buttonNamed('Aprobar y publicar')!.click();   // el servidor lo rechaza
      await settle();
      buttonNamed('Aprobar y publicar')!.click();   // reabre con lo escrito; se cancela
      await settle();
      buttonNamed('Aprobar y publicar')!.click();   // tras cancelar, parte de cero
      await settle();

      expect(decide.mock.calls[0][1].data.draft).toBeUndefined();
      expect(decide.mock.calls[1][1].data.draft).toEqual(typed);
      expect(decide.mock.calls[2][1].data.draft).toBeUndefined();
    });

    it('si no carga el ciclo de vida lo dice y «Reintentar» vuelve a pedirlo', async () => {
      let calls = 0;
      setup(new Observable<CaseLifecycle>(subscriber => {
        if (++calls === 1) subscriber.error(http(500, { code: 'SERVER' }));
        else { subscriber.next(DRAFT); subscriber.complete(); }
      }));
      expect(el().querySelector('ui-error-state')).not.toBeNull();

      (el().querySelector('ui-error-state button') as HTMLButtonElement).click();
      await settle();
      render();

      expect(api.lifecycle).toHaveBeenCalledTimes(2);
      expect(el().querySelector('ui-error-state')).toBeNull();
      expect(text()).toContain('Borrador');
    });

    it('mientras una transición está en curso no hay doble envío: un segundo clic no pide otra confirmación ni otra petición', async () => {
      setup();
      api.transitionCase.mockReturnValueOnce(new Subject<CaseLifecycle>());

      buttonNamed('Enviar a revisión')!.click();
      await settle();
      render();
      expect(buttonNamed('Archivar')!.getAttribute('aria-disabled')).toBe('true');

      buttonNamed('Enviar a revisión')!.click();
      buttonNamed('Archivar')!.click();
      await settle();

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(api.transitionCase).toHaveBeenCalledTimes(1);
    });
  });

  // req: RF-12
  it('la región de estado SIEMPRE existe, también mientras carga', () => {
    setup(new Subject<CaseLifecycle>());

    expect(el().querySelector('p[role="status"]')).not.toBeNull();
  });

  // req: RF-13
  it('muestra la última revisión: quién la pidió, qué se decidió, la nota y la constancia con su fecha tal cual el servidor la manda', () => {
    setup({
      caseVersionId: 9, state: 'DRAFT', allowedTransitions: ['submit'],
      review: {
        requestedBy: 'Ana Gómez', requestedAt: '2026-10-10T10:00:00+00:00', decision: 'REJECTED', decidedBy: 'Luis Peña',
        decidedAt: '2026-10-11T09:00:00+00:00', note: 'Falta contexto', reason: 'FORMA',
        contentReview: { reviewer: 'Dra. Ruiz', reviewedOn: '2026-10-10', reference: 'Acta 4' },
      },
    });

    expect(text()).toContain('Luis Peña');
    expect(text()).toContain('Falta contexto');
    expect(text()).toContain('Forma');
    expect(text()).toContain('Dra. Ruiz');
    expect(text()).toContain('Acta 4');
    // La fecha de la constancia (un día sin hora) es ese día, no el anterior por la zona horaria.
    expect(text()).toMatch(/Dra\. Ruiz, 10 de oct\.? de 2026, Acta 4/);
  });
});
