import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { AdminUser, UserAdminService } from '../../core/api/user-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ConfirmDialogComponent } from '../../shared/confirm/confirm-dialog.component';
import { UsersComponent } from './users.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar, con Material real y el DOM renderizado.
 *
 * `form.reset()` no reinicia `FormGroupDirective.submitted`, y el
 * `ErrorStateMatcher` de Material muestra el error si el campo es inválido y
 * está tocado O el formulario fue enviado. Estas pruebas comprueban lo que ve
 * el usuario: tras enviar con errores, cambiar de formulario (Nuevo usuario,
 * Cancelar, editar, atender una solicitud, guardar con éxito) no debe dejar
 * ningún `mat-error` visible en un formulario en blanco.
 */
const ana = { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true } as AdminUser;
const solicitud = {
  id: 21,
  nombre: 'Rosa',
  apellido: 'Vega',
  email: 'rosa@siep.test',
  status: 'PENDING',
  createdAt: '2026-09-01T10:00:00Z',
  reviewedAt: null,
} as AccessRequest;

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

describe('usuarios: validar al enviar (DOM con Material)', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersComponent;
  let root: HTMLElement;
  let service: { list: Mock; create: Mock; update: Mock; updateStatus: Mock };

  const errorTexts = () => Array.from(root.querySelectorAll('mat-error')).map(node => (node.textContent ?? '').trim());
  const button = (label: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(candidate => (candidate.textContent ?? '').includes(label))!;
  const formSubmitted = () => fixture.debugElement.query(By.directive(FormGroupDirective)).injector.get(FormGroupDirective).submitted;
  const submit = () => {
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
  };
  const fillValid = () => {
    component.form.patchValue({ nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test', password: '12345678' });
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = { list: vi.fn(() => of([ana])), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() };
    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideNoopAnimations(),
        { provide: UserAdminService, useValue: service },
        { provide: AccessRequestAdminService, useValue: { listPending: vi.fn(() => of([])), updateStatus: vi.fn() } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(UsersComponent, {
      remove: { imports: [ConfirmDialogComponent] },
      add: { imports: [ConfirmDialogStub] },
    });
    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
    root = fixture.nativeElement;
    document.body.appendChild(root);
    fixture.detectChanges();
  });

  afterEach(() => {
    root.remove();
    TestBed.resetTestingModule();
  });

  it('al abrir el formulario no muestra ningún error', () => {
    expect(errorTexts()).toEqual([]);
  });

  it('enviar vacío muestra el error de cada campo obligatorio y no llama al servicio', () => {
    submit();

    expect(errorTexts()).toEqual([
      'Escribe el nombre.',
      'Escribe el apellido.',
      'Escribe el correo.',
      'La contraseña es obligatoria al crear un usuario.',
    ]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('«Nuevo usuario» tras un envío inválido deja el formulario en blanco sin errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    button('Nuevo usuario').click();
    fixture.detectChanges();

    expect(errorTexts()).toEqual([]);
  });

  it('«Cancelar» tras un envío inválido deja el formulario en blanco sin errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    button('Cancelar').click();
    fixture.detectChanges();

    expect(errorTexts()).toEqual([]);
  });

  it('editar un usuario tras un envío inválido no muestra errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.editUser(ana);
    fixture.detectChanges();

    expect(errorTexts()).toEqual([]);
    expect(formSubmitted()).toBe(false);
  });

  it('editar un usuario con un dato vacío no muestra su error hasta que se envía', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.editUser({ ...ana, apellido: '' });
    fixture.detectChanges();
    expect(errorTexts()).toEqual([]);

    submit();
    expect(errorTexts()).toEqual(['Escribe el apellido.']);
  });

  it('atender una solicitud de acceso tras un envío inválido no muestra errores', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);

    component.attendRequest(solicitud);
    fixture.detectChanges();

    expect(errorTexts()).toEqual([]);
    expect(formSubmitted()).toBe(false);
  });

  it('guardar con éxito tras un envío inválido no deja errores en el formulario recargado', () => {
    submit();
    expect(errorTexts().length).toBeGreaterThan(0);
    fillValid();
    service.create.mockReturnValue(of({ ...ana, id: 6, nombre: 'Luis', email: 'luis@siep.test' }));

    submit();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(errorTexts()).toEqual([]);
    expect(formSubmitted()).toBe(false);
  });

  it('después de reiniciar el formulario, un nuevo envío vacío vuelve a mostrar los errores', () => {
    submit();
    button('Nuevo usuario').click();
    fixture.detectChanges();
    expect(errorTexts()).toEqual([]);

    submit();

    expect(errorTexts()).toContain('Escribe el nombre.');
  });

  it('al editar, un correo inválido se explica y no se pide contraseña', () => {
    component.editUser(ana);
    component.form.patchValue({ email: 'no-es-correo' });
    fixture.detectChanges();

    submit();

    expect(errorTexts()).toEqual(['Escribe un correo válido.']);
  });
});
