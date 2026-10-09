import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { SimulationService } from '../../core/api/simulation.service';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../shared/confirm/confirm-dialog.component';
import { GrupoListComponent } from './grupo-list.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar el formulario de grupo, con Material real y el DOM renderizado.
 *
 * `form.reset()` no reinicia `FormGroupDirective.submitted`, y el
 * `ErrorStateMatcher` de Material muestra el error si el campo es inválido y
 * está tocado O el formulario fue enviado. Estas pruebas comprueban lo que ve
 * el usuario: tras enviar con errores, cancelar, editar otro grupo o guardar
 * con éxito no debe quedar ningún `mat-error` visible en un formulario recién
 * cargado. Y, con el detalle de un grupo abierto (el formulario de casos nace
 * inválido), el foco debe ir al formulario del grupo y no al del caso.
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 };
const grupoB: Grupo = { id: 2, nombre: 'Cohorte B', codigo: 'COH-B', totalEstudiantes: 0 };
const caso = { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' } as SimulationCaseSummary;

// ts-jest no aplica la transformación JIT de Angular a los inputs con signals
// (NG0303 al enlazar `[open]`, `[title]`...). El diálogo de confirmación no
// interviene en el formulario, así que se sustituye por un doble con @Input.
@Component({ selector: 'app-confirm-dialog', standalone: true, changeDetection: ChangeDetectionStrategy.Eager,
 template: '' })
class ConfirmDialogStub {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = '';
  @Input() loading = false;
  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}

describe('grupos: validar al enviar el formulario de grupo (DOM con Material)', () => {
  let fixture: ComponentFixture<GrupoListComponent>;
  let component: GrupoListComponent;
  let root: HTMLElement;
  let service: Record<'listar' | 'crear' | 'actualizar' | 'eliminar' | 'importSpec' | 'listarEstudiantes' | 'listarCasos', Mock>;

  const errorTexts = () => Array.from(root.querySelectorAll('mat-error')).map(node => (node.textContent ?? '').trim());
  const groupForm = () => root.querySelector<HTMLFormElement>('.form-card form')!;
  const groupSubmitButton = () => groupForm().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const groupFormSubmitted = () => fixture.debugElement.query(By.css('.form-card form')).injector.get(FormGroupDirective).submitted;
  const button = (label: string) =>
    Array.from(groupForm().querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.textContent ?? '').includes(label))!;
  const submit = () => {
    groupSubmitButton().click();
    fixture.detectChanges();
  };
  const edit = (grupo: Grupo) => {
    component.editarGrupo(grupo);
    fixture.detectChanges();
  };
  const fillValid = () => {
    component.form.patchValue({ nombre: 'Cohorte C', codigo: 'COH-C' });
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = {
      listar: vi.fn(() => of([grupoA, grupoB])),
      crear: vi.fn(),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
      importSpec: vi.fn(() => of({ requiredColumns: ['nombre'], optionalColumns: [], columns: ['nombre'], templateFilename: 'plantilla.xlsx', acceptedExtensions: ['.xlsx'] })),
      listarEstudiantes: vi.fn(() => of([])),
      listarCasos: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({
      imports: [GrupoListComponent],
      providers: [
        provideNoopAnimations(),
        { provide: GrupoService, useValue: service },
        { provide: SimulationService, useValue: { listCases: vi.fn(() => of([caso])) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(GrupoListComponent, {
      remove: { imports: [ConfirmDialogComponent] },
      add: { imports: [ConfirmDialogStub] },
    });
    fixture = TestBed.createComponent(GrupoListComponent);
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
    it('al abrir la pantalla no muestra ningún error', () => {
      expect(errorTexts()).toEqual([]);
    });

    it('enviar vacío muestra el error de nombre y de código y no llama al servicio', () => {
      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre del grupo.', 'Escribe el código del grupo.']);
      expect(service.crear).not.toHaveBeenCalled();
    });

    it('enviar vacío lleva el foco al nombre', () => {
      submit();

      expect(document.activeElement).toBe(groupForm().querySelector('input[formControlName="nombre"]'));
    });

    it('con el detalle de un grupo abierto, el foco va al nombre y no al select del caso', () => {
      component.gestionarGrupo(grupoA);
      fixture.detectChanges();
      const select = root.querySelector<HTMLSelectElement>('select[formControlName="caseVersionId"]')!;
      expect(select.classList.contains('ng-invalid')).toBe(true);

      submit();

      expect(document.activeElement).toBe(groupForm().querySelector('input[formControlName="nombre"]'));
      expect(document.activeElement).not.toBe(select);
      expect(errorTexts()).toEqual(['Escribe el nombre del grupo.', 'Escribe el código del grupo.']);
      expect(component.casoForm.touched).toBe(false);
    });

    it('el foco se busca solo dentro del formulario del grupo, aunque haya otro control inválido antes en la página', () => {
      // En el DOM real el formulario del grupo va antes que los de casos y estudiantes; este
      // control ajeno, colocado antes, fija que la búsqueda no depende de ese orden.
      const ajeno = document.createElement('input');
      ajeno.className = 'ng-invalid';
      root.insertBefore(ajeno, root.firstChild);

      submit();

      expect(document.activeElement).toBe(groupForm().querySelector('input[formControlName="nombre"]'));
      expect(document.activeElement).not.toBe(ajeno);
    });

    it('con el nombre escrito, el foco va al código', () => {
      component.gestionarGrupo(grupoA);
      component.form.patchValue({ nombre: 'Cohorte C' });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el código del grupo.']);
      expect(document.activeElement).toBe(groupForm().querySelector('input[formControlName="codigo"]'));
    });

    it('al editar, dejar el nombre vacío explica el error y no llama al servicio', () => {
      edit(grupoA);
      component.form.patchValue({ nombre: '' });
      fixture.detectChanges();

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre del grupo.']);
      expect(service.actualizar).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(groupForm().querySelector('input[formControlName="nombre"]'));
    });

    it('el botón no se deshabilita por un formulario inválido', () => {
      expect(component.form.invalid).toBe(true);
      expect(groupSubmitButton().disabled).toBe(false);
      expect((groupSubmitButton().textContent ?? '').trim()).toBe('Crear grupo');
    });

    it('el botón se deshabilita solo mientras guarda', () => {
      component.saving.set(true);
      fixture.detectChanges();

      expect(groupSubmitButton().disabled).toBe(true);
    });
  });

  describe('reinicio del estado «enviado»', () => {
    it('«Cancelar» tras un envío inválido deja el formulario en blanco sin errores', () => {
      edit(grupoA);
      component.form.patchValue({ nombre: '' });
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      expect(groupFormSubmitted()).toBe(true);

      button('Cancelar').click();
      fixture.detectChanges();

      expect(errorTexts()).toEqual([]);
      expect(groupFormSubmitted()).toBe(false);
      expect(component.form.getRawValue()).toEqual({ nombre: null, codigo: null });
    });

    it('editar otro grupo tras un envío inválido no muestra errores', () => {
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);

      edit(grupoB);

      expect(errorTexts()).toEqual([]);
      expect(groupFormSubmitted()).toBe(false);
      expect(component.form.getRawValue()).toEqual({ nombre: 'Cohorte B', codigo: 'COH-B' });
    });

    it('crear con éxito tras un envío inválido deja el formulario en blanco sin errores', () => {
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      fillValid();
      service.crear.mockReturnValue(of({ id: 3, nombre: 'Cohorte C', codigo: 'COH-C', totalEstudiantes: 0 }));

      submit();

      expect(service.crear).toHaveBeenCalledTimes(1);
      expect(service.crear).toHaveBeenCalledWith('Cohorte C', 'COH-C');
      expect(errorTexts()).toEqual([]);
      expect(groupFormSubmitted()).toBe(false);
      expect(component.form.getRawValue()).toEqual({ nombre: null, codigo: null });
    });

    it('actualizar con éxito tras un envío inválido deja el formulario en blanco sin errores', () => {
      edit(grupoA);
      component.form.patchValue({ nombre: '' });
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      component.form.patchValue({ nombre: 'Cohorte A2' });
      fixture.detectChanges();
      service.actualizar.mockReturnValue(of({ ...grupoA, nombre: 'Cohorte A2' }));

      submit();

      expect(service.actualizar).toHaveBeenCalledWith(1, { nombre: 'Cohorte A2', codigo: 'COH-A' });
      expect(component.editandoGrupo()).toBeNull();
      expect(errorTexts()).toEqual([]);
      expect(groupFormSubmitted()).toBe(false);
    });

    it('borrar el grupo que se estaba editando tras un envío inválido no deja errores', () => {
      edit(grupoA);
      component.form.patchValue({ nombre: '' });
      fixture.detectChanges();
      submit();
      expect(errorTexts().length).toBeGreaterThan(0);
      service.eliminar.mockReturnValue(of(undefined));

      component.eliminarGrupo(grupoA);
      component.runPendingConfirm();
      fixture.detectChanges();

      expect(service.eliminar).toHaveBeenCalledWith(1);
      expect(component.editandoGrupo()).toBeNull();
      expect(errorTexts()).toEqual([]);
      expect(groupFormSubmitted()).toBe(false);
    });

    it('después de reiniciar el formulario, un nuevo envío vacío vuelve a mostrar los errores', () => {
      edit(grupoA);
      component.form.patchValue({ nombre: '' });
      fixture.detectChanges();
      submit();
      button('Cancelar').click();
      fixture.detectChanges();
      expect(errorTexts()).toEqual([]);

      submit();

      expect(errorTexts()).toEqual(['Escribe el nombre del grupo.', 'Escribe el código del grupo.']);
      expect(service.crear).not.toHaveBeenCalled();
    });
  });
});
