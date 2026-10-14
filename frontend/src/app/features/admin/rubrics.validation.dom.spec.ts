import { FormGroupDirective } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of } from 'rxjs';

import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { SimulationService } from '../../core/api/simulation.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { RubricsComponent } from './rubrics.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar, con Material real y el DOM renderizado.
 *
 * `form.reset()` no reinicia `FormGroupDirective.submitted`, y el
 * `ErrorStateMatcher` de Material muestra el error si el campo es inválido y
 * está tocado O el formulario fue enviado. Estas pruebas comprueban lo que ve
 * el usuario: tras enviar con errores, abrir otra rúbrica o crear una nueva no
 * debe dejar ningún `mat-error` visible en un formulario recién cargado. Y la
 * regla del 100 % de la ponderación debe estar explicada en el DOM.
 */
function rubric(id: number, name: string, weights: number[]): RubricAdmin {
  return {
    id,
    name,
    description: null,
    active: false,
    version: '1.0',
    isDefault: false,
    totalWeight: weights.reduce((sum, weight) => sum + weight, 0),
    criteriaCount: weights.length,
    criteria: weights.map((weight, index) => ({ id: id * 10 + index, title: `Criterio ${index + 1}`, weight, displayOrder: index + 1, active: true })),
  } as RubricAdmin;
}

const completa = rubric(4, 'Entrevista clínica', [60, 40]);
const incompleta = rubric(7, 'Observación', [60, 30]);
const sinNombre = { ...rubric(9, 'Con hueco', [100]), criteria: [{ id: 91, title: '', weight: 100, displayOrder: 1, active: true }] } as RubricAdmin;

describe('rúbricas: validar al enviar (DOM con Material)', () => {
  let fixture: ComponentFixture<RubricsComponent>;
  let component: RubricsComponent;
  let root: HTMLElement;
  let service: { list: Mock; detail: Mock; create: Mock; update: Mock };

  const errorTexts = () => Array.from(root.querySelectorAll('mat-error')).map(node => (node.textContent ?? '').trim());
  const actionButton = (label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('.actions button')).find(candidate => (candidate.textContent ?? '').trim().includes(label))!;
  const button = (label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.textContent ?? '').includes(label))!;
  const hint = () => root.querySelector('#rubric-weight-hint');
  const formSubmitted = () => fixture.debugElement.query(By.directive(FormGroupDirective)).injector.get(FormGroupDirective).submitted;
  const submit = () => {
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
  };
  const open = (item: RubricAdmin) => {
    service.detail.mockReturnValue(of(item));
    component.openRubric(item.id);
    fixture.detectChanges();
  };
  const fillValid = () => {
    component.form.patchValue({ name: 'Entrevista clínica' });
    component.criteria.at(0).patchValue({ title: 'Escucha', weight: 100 });
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = {
      list: vi.fn(() => of([])),
      detail: vi.fn(() => of(completa)),
      create: vi.fn(),
      update: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [RubricsComponent],
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: RubricService, useValue: service },
        { provide: SimulationService, useValue: { listCases: vi.fn(() => of([])) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(RubricsComponent);
    component = fixture.componentInstance;
    root = fixture.nativeElement;
    document.body.appendChild(root);
    fixture.detectChanges();
  });

  afterEach(() => {
    root.remove();
    TestBed.resetTestingModule();
  });

  describe('errores al enviar', () => {
    it('al abrir el formulario no muestra ningún error', () => {
      expect(errorTexts()).toEqual([]);
    });

    it('enviar vacío muestra el error de cada campo obligatorio y no llama al servicio', () => {
      component.newRubric();
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre de la rúbrica.', 'Escribe el nombre del criterio.']);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('enviar vacío lleva el foco al primer campo inválido', () => {
      component.newRubric();
      fixture.detectChanges();

      submit();

      expect(document.activeElement).toBe(root.querySelector('input[formControlName="name"]'));
    });

    it('con el nombre correcto, el foco va al criterio inválido', () => {
      component.newRubric();
      component.form.patchValue({ name: 'Entrevista clínica' });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre del criterio.']);
      expect(document.activeElement).toBe(root.querySelector('input[formControlName="title"]'));
    });

    it('explica versión vacía, peso fuera de rango y orden menor que 1', () => {
      component.newRubric();
      fillValid();
      component.form.patchValue({ version: '' });
      component.criteria.at(0).patchValue({ weight: 101, displayOrder: 0 });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe la versión.', 'El peso va de 0 a 100.', 'El orden empieza en 1.']);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('el botón Guardar no se deshabilita por un formulario inválido', () => {
      component.newRubric();
      fixture.detectChanges();

      expect(component.form.invalid).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    });

    it('el botón Guardar se deshabilita solo mientras guarda', () => {
      component.saving.set(true);
      fixture.detectChanges();

      expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    });
  });

  describe('reinicio del estado «enviado»', () => {
    it('«Nueva rúbrica» tras un envío inválido deja el formulario en blanco sin errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      expect(formSubmitted()).toBe(true);

      button('Nueva rúbrica').click();
      fixture.detectChanges();

      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('abrir otra rúbrica tras un envío inválido no muestra errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);

      open(incompleta);

      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('abrir una rúbrica con un dato vacío no muestra su error hasta que se envía', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);

      open(sinNombre);
      expect(errorTexts()).toEqual([]);

      submit();
      expect(errorTexts()).toEqual(['Escribe el nombre del criterio.']);
    });

    it('guardar con éxito tras un envío inválido no deja errores en el formulario recargado', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      fillValid();
      service.create.mockReturnValue(of(completa));

      submit();

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(errorTexts()).toEqual([]);
      expect(formSubmitted()).toBe(false);
    });

    it('después de reiniciar el formulario, un nuevo envío vacío vuelve a mostrar los errores', () => {
      component.newRubric();
      fixture.detectChanges();
      submit();
      button('Nueva rúbrica').click();
      fixture.detectChanges();
      expect(errorTexts()).toEqual([]);

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre de la rúbrica.', 'Escribe el nombre del criterio.']);
    });
  });

  describe('regla del 100 % de la ponderación', () => {
    it('con la ponderación en 100 no hay pista y los botones no la referencian', () => {
      open(completa);

      expect(hint()).toBeNull();
      expect(actionButton('Activar').hasAttribute('aria-describedby')).toBe(false);
      expect(actionButton('Predeterminada').hasAttribute('aria-describedby')).toBe(false);
      expect(actionButton('Activar').disabled).toBe(false);
      expect(actionButton('Predeterminada').disabled).toBe(false);
    });

    it('con la ponderación distinta de 100 explica por qué Activar y Predeterminada están deshabilitados', () => {
      open(incompleta);

      expect(hint()).not.toBeNull();
      expect((hint()!.textContent ?? '').trim()).toBe('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
      expect(root.querySelectorAll('#rubric-weight-hint').length).toBe(1);
      expect(actionButton('Activar').disabled).toBe(true);
      expect(actionButton('Predeterminada').disabled).toBe(true);
      expect(actionButton('Activar').getAttribute('aria-describedby')).toBe('rubric-weight-hint');
      expect(actionButton('Predeterminada').getAttribute('aria-describedby')).toBe('rubric-weight-hint');
    });

    it('la pista solo se enlaza desde Activar y Predeterminada', () => {
      open(incompleta);

      const describedBy = Array.from(root.querySelectorAll('[aria-describedby="rubric-weight-hint"]'));
      expect(describedBy).toEqual([actionButton('Activar'), actionButton('Predeterminada')]);
    });

    it('la pista aparece y desaparece al cambiar la ponderación', () => {
      open(completa);
      expect(hint()).toBeNull();

      component.criteria.at(0).patchValue({ weight: 50 });
      fixture.detectChanges();
      expect(hint()).not.toBeNull();
      expect(actionButton('Activar').getAttribute('aria-describedby')).toBe('rubric-weight-hint');

      component.criteria.at(0).patchValue({ weight: 60 });
      fixture.detectChanges();
      expect(hint()).toBeNull();
      expect(actionButton('Activar').hasAttribute('aria-describedby')).toBe(false);
    });

    it('una rúbrica nueva sin ponderación también muestra la pista', () => {
      component.newRubric();
      fixture.detectChanges();

      expect(hint()).not.toBeNull();
    });
  });
});
