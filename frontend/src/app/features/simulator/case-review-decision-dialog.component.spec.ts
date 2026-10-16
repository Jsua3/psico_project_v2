import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CaseReviewDecisionData, CaseReviewDecisionDialogComponent } from './case-review-decision-dialog.component';

/**
 * Diálogo de decisión de la revisión (plan visual F10-6†; RF-13, CU-05; contrato C4): aprobar lleva una nota opcional y,
 * si el servidor la pide, la constancia de revisión de contenido (revisor, fecha y referencia); devolver a borrador
 * exige motivo (FORMA o CONTENIDO) y una nota para quien autora el caso. Cerrar sin decidir no devuelve nada.
 */
describe('CaseReviewDecisionDialogComponent', () => {
  let fixture: ComponentFixture<CaseReviewDecisionDialogComponent>;
  let close: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  const setup = (data: CaseReviewDecisionData) => {
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [CaseReviewDecisionDialogComponent],
      providers: [
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    fixture = TestBed.createComponent(CaseReviewDecisionDialogComponent);
    fixture.detectChanges();
  };

  /** El control de un campo, encontrado por la etiqueta que ve la persona. */
  const control = (label: string) => {
    const found = Array.from(el().querySelectorAll<HTMLLabelElement>('label')).find(item => (item.textContent ?? '').includes(label));
    if (!found) throw new Error(`No hay un campo «${label}»`);
    return el().querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${found.htmlFor}`)!;
  };
  const write = (label: string, value: string) => {
    const target = control(label);
    target.value = value;
    target.dispatchEvent(new Event(target instanceof HTMLSelectElement ? 'change' : 'input'));
  };
  const submit = () => {
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  const errors = () => Array.from(el().querySelectorAll('.ui-field__message--error')).map(item => (item.textContent ?? '').trim()).filter(Boolean);
  const isoDay = (offsetDays: number) => {
    const day = new Date();
    day.setDate(day.getDate() + offsetDays);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  };

  // req: RF-13, CU-05
  describe('devolver a borrador', () => {
    beforeEach(() => setup({ mode: 'reject', contentReviewRequired: false }));

    it('se nombra por lo que hace y pide motivo y nota, sin pedir la constancia', () => {
      expect(el().querySelector('h2')?.textContent).toContain('Devolver el caso a borrador');
      expect(control('Motivo')).not.toBeNull();
      expect(control('Nota')).not.toBeNull();
      expect(el().textContent).not.toContain('Constancia');
    });

    it('sin motivo ni nota no se cierra: dice qué falta en cada campo y lleva el foco al primero', async () => {
      submit();
      await settle();

      expect(close).not.toHaveBeenCalled();
      expect(errors()).toEqual([
        expect.stringContaining('motivo'),
        expect.stringContaining('nota'),
      ]);
      expect(control('Motivo').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(control('Motivo'));
    });

    it('una nota de solo espacios no cuenta', () => {
      write('Motivo', 'CONTENIDO');
      write('Nota', '   ');
      submit();

      expect(close).not.toHaveBeenCalled();
      expect(errors()).toEqual([expect.stringContaining('nota')]);
    });

    it('con motivo y nota devuelve ambos, sin espacios sobrantes', () => {
      write('Motivo', 'FORMA');
      write('Nota', '  Falta contexto en la escena 2.  ');
      submit();

      expect(close).toHaveBeenCalledWith({ reason: 'FORMA', note: 'Falta contexto en la escena 2.' });
    });

    it('«Cancelar» cierra sin decidir', () => {
      const cancel = Array.from(el().querySelectorAll('button')).find(button => (button.textContent ?? '').includes('Cancelar'))!;
      cancel.click();

      expect(close).toHaveBeenCalledTimes(1);
      expect(close.mock.calls[0]).toEqual([]);
    });
  });

  // req: RF-13, CU-05, RN-07
  describe('aprobar y publicar', () => {
    it('la nota es opcional y la constancia también si el servidor no la exige: aprobar sin nada devuelve una decisión vacía', () => {
      setup({ mode: 'approve', contentReviewRequired: false });

      expect(el().querySelector('h2')?.textContent).toContain('Aprobar y publicar');
      submit();

      expect(close).toHaveBeenCalledWith({});
    });

    it('lleva la nota escrita', () => {
      setup({ mode: 'approve', contentReviewRequired: false });
      write('Nota', 'Cumple con lo acordado.');
      submit();

      expect(close).toHaveBeenCalledWith({ note: 'Cumple con lo acordado.' });
    });

    it('una constancia a medias no pasa: pide lo que falta', () => {
      setup({ mode: 'approve', contentReviewRequired: false });
      write('Quién revisó', 'Dra. Ruiz');
      submit();

      expect(close).not.toHaveBeenCalled();
      expect(errors()).toEqual([expect.stringContaining('fecha'), expect.stringContaining('referencia')]);
    });

    it('cuando el servidor la exige, los tres campos son obligatorios desde el principio', () => {
      setup({ mode: 'approve', contentReviewRequired: true });

      expect(control('Quién revisó').getAttribute('aria-required')).toBe('true');
      submit();

      expect(close).not.toHaveBeenCalled();
      expect(errors()).toHaveLength(3);
    });

    it('una fecha posterior a hoy no es una constancia válida', () => {
      setup({ mode: 'approve', contentReviewRequired: false });
      write('Quién revisó', 'Dra. Ruiz');
      write('Fecha de la revisión', isoDay(1));
      write('Referencia', 'Acta 4');
      submit();

      expect(close).not.toHaveBeenCalled();
      expect(errors()).toEqual([expect.stringContaining('posterior a hoy')]);
    });

    it('con la constancia completa la devuelve junto con la nota', () => {
      setup({ mode: 'approve', contentReviewRequired: true });
      write('Nota', 'Aprobado.');
      write('Quién revisó', ' Dra. Ruiz ');
      write('Fecha de la revisión', isoDay(-2));
      write('Referencia', 'Acta 4 de Psicología');
      submit();

      expect(close).toHaveBeenCalledWith({
        note: 'Aprobado.',
        contentReview: { reviewer: 'Dra. Ruiz', reviewedOn: isoDay(-2), reference: 'Acta 4 de Psicología' },
      });
    });
  });
});
