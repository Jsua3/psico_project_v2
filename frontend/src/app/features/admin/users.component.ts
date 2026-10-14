import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminUser, UserAdminService, UserRole } from '../../core/api/user-admin.service';
import { AccessRequest, AccessRequestAdminService } from '../../core/api/access-request-admin.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { roleLabel } from '../../shared/ui/labels';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';
import { UiPageActions, UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { UserFormSheetComponent, UserFormSheetData } from './user-form-sheet.component';

interface UserFormValue {
  nombre: string;
  apellido: string;
  email: string;
  role: UserRole;
  password: string;
}

/**
 * Pantalla Usuarios (plan visual F7-6): una tabla con el error separado del vacío, un botón de editar con ayuda y un
 * menú por fila, el formulario en una hoja lateral (`UiDialog.sheet`) y las solicitudes de acceso con su error a la
 * vista (antes un fallo se tragaba y parecía «no hay solicitudes»). Activar o desactivar confirma con el diálogo de la
 * biblioteca.
 */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiBadge, UiButton, UiIconButton, UiMenu, UiPageActions, UiPageHeader, UiSection,
    UiEmptyState, UiErrorState, UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  // Eager: los errores de los campos de la hoja salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UsersComponent implements OnInit {
  private readonly service = inject(UserAdminService);
  private readonly accessRequestsService = inject(AccessRequestAdminService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(UiDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** La hoja abierta con el formulario (null si no hay). */
  private sheet: DialogRef<void, UserFormSheetComponent> | null = null;
  /** true mientras hay una confirmación abierta: un segundo gesto no abre otra ni repite la acción. */
  private confirmando = false;

  readonly roles: UserRole[] = ['ADMIN', 'PROFESOR', 'ESTUDIANTE'];
  readonly roleLabel = roleLabel;
  readonly users = signal<AdminUser[]>([]);
  readonly accessRequests = signal<AccessRequest[]>([]);
  /** Las solicitudes no pudieron cargarse (distinto de «no hay solicitudes»). */
  readonly requestsError = signal(false);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  /** El fallo de la CARGA de la lista (solo `load()` lo toca: abrir un formulario o guardar no lo borra). */
  readonly error = signal('');
  readonly message = signal('');

  /** Estado de la tabla (esqueleto, error con «Reintentar», primer uso o lista): una sola señal, de a uno. */
  readonly state = uiDataState({
    loading: this.loading,
    error: this.error,
    isEmpty: computed(() => this.users().length === 0),
  });
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.state() === 'loading' ? 'Cargando usuarios…' : ''));

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['ESTUDIANTE' as UserRole, Validators.required],
    password: ['']
  });

  statusConfirmMessage(user: AdminUser): string {
    return user.activo
      ? `¿Desactivar a ${user.nombre} ${user.apellido}? No podrá iniciar sesión hasta reactivarlo.`
      : `¿Activar a ${user.nombre} ${user.apellido}?`;
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, message: string): string | null {
    return control.touched && control.invalid ? message : null;
  }

  /**
   * Reinicia valores y marca los campos como no tocados: un formulario recién abierto no hereda los errores del envío
   * fallido anterior (los errores de la hoja salen de `touched`; cada apertura trae además su propia directiva).
   */
  private resetUserForm(value: UserFormValue): void {
    this.form.reset(value);
  }

  /** Al crear, la contraseña es obligatoria; al editar, vacía significa «no cambiarla». */
  private setPasswordRules(creating: boolean): void {
    const password = this.form.controls.password;
    password.setValidators(creating ? [Validators.required, Validators.minLength(8)] : [Validators.minLength(8)]);
    password.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit() {
    this.setPasswordRules(true);
    this.load();
    this.loadAccessRequests();
  }

  loadAccessRequests() {
    this.requestsError.set(false);
    this.accessRequestsService.listPending().subscribe({
      next: requests => this.accessRequests.set(requests),
      error: () => {
        this.accessRequests.set([]);
        this.requestsError.set(true);
      },
    });
  }

  attendRequest(request: AccessRequest) {
    this.selectedUser.set(null);
    this.resetUserForm({
      nombre: request.nombre,
      apellido: request.apellido,
      email: request.email,
      role: 'ESTUDIANTE',
      password: '',
    });
    this.setPasswordRules(true);
    this.message.set(`Solicitud de ${request.nombre} ${request.apellido} lista para crear usuario.`);
    this.openForm();
  }

  dismissRequest(request: AccessRequest) {
    if (this.saving()) return;
    this.saving.set(true);
    this.accessRequestsService.updateStatus(request.id, 'DISMISSED').subscribe({
      next: () => {
        this.accessRequests.update(items => items.filter(item => item.id !== request.id));
        this.notify.success('Solicitud descartada.');
        this.saving.set(false);
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible actualizar la solicitud.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      },
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.service.list().subscribe({
      next: users => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los usuarios.');
        this.loading.set(false);
      }
    });
  }

  newUser() {
    this.selectedUser.set(null);
    this.resetUserForm({
      nombre: '',
      apellido: '',
      email: '',
      role: 'ESTUDIANTE',
      password: ''
    });
    this.setPasswordRules(true);
    this.message.set('');
    this.openForm();
  }

  editUser(user: AdminUser) {
    this.populateEdit(user);
    this.message.set('');
    this.openForm();
  }

  /** Deja el formulario con los datos del usuario (sin abrir la hoja). */
  private populateEdit(user: AdminUser): void {
    this.selectedUser.set(user);
    this.resetUserForm({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      role: user.role,
      password: ''
    });
    this.setPasswordRules(false);
  }

  /** Abre la hoja con el formulario (si ya estaba abierta, la conserva: el formulario es el mismo). */
  private openForm(): void {
    if (this.sheet) return;
    const ref = this.dialog.sheet<void, UserFormSheetData, UserFormSheetComponent>(UserFormSheetComponent, {
      side: 'end',
      data: { host: this },
    });
    this.sheet = ref;
    ref.closed?.subscribe(() => {
      if (this.sheet === ref) this.sheet = null;
    });
  }

  closeForm(): void {
    const ref = this.sheet;
    this.sheet = null;
    ref?.close();
  }

  save() {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // El foco va al primer campo inválido: la hoja vive en la capa superior, no dentro de esta pantalla.
      focusFirstInvalid(this.sheetElement() ?? this.host.nativeElement);
      return;
    }
    const selected = this.selectedUser();
    const value = this.form.getRawValue();
    const email = value.email.trim().toLowerCase();
    // La hoja desde la que se envía: al responder el servidor puede haberse cerrado o haber otra (formulario nuevo).
    const sheetAtSave = this.sheet;
    this.saving.set(true);
    this.message.set('');

    const request$ = selected
      ? this.service.update(selected.id, {
          email,
          password: value.password || undefined,
          nombre: value.nombre,
          apellido: value.apellido,
          role: value.role
        })
      : this.service.create({
          email,
          password: value.password,
          nombre: value.nombre,
          apellido: value.apellido,
          role: value.role,
          activo: true
        });

    request$.subscribe({
      next: saved => {
        this.users.update(users => {
          const exists = users.some(user => user.id === saved.id);
          return exists ? users.map(user => user.id === saved.id ? saved : user) : [...users, saved];
        });
        this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');
        this.saving.set(false);
        // Solo se toca el formulario y la hoja si siguen siendo los del envío: una respuesta tardía no pisa otro formulario.
        if (this.sheet === sheetAtSave) {
          this.populateEdit(saved);
          this.closeForm();
        }
        this.loadAccessRequests();
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible guardar los cambios.');
        if (text) this.notify.error(text);
        this.saving.set(false);
        // Si la hoja se cerró mientras se guardaba, vuelve con lo que se escribió (el formulario no se perdió).
        this.openForm();
      }
    });
  }

  /** La capa de la hoja abierta (donde viven los campos), para llevar el foco al primer campo inválido. */
  private sheetElement(): HTMLElement | null {
    return (this.sheet?.overlayRef?.overlayElement as HTMLElement | undefined) ?? null;
  }

  // ── Acciones de la fila ───────────────────────────────────────────────────────────────────────────────────────
  rowActions(user: AdminUser): UiMenuItem[] {
    return [{
      value: 'estado',
      label: user.activo ? 'Desactivar usuario' : 'Activar usuario',
      icon: user.activo ? 'block' : 'check_circle',
      tone: user.activo ? 'danger' : 'default',
    }];
  }

  rowAction(user: AdminUser, action: string | undefined): void {
    if (action === 'estado') void this.toggleStatus(user);
  }

  async toggleStatus(user: AdminUser): Promise<void> {
    if (this.saving() || this.confirmando) return;
    this.confirmando = true;
    let confirmed = false;
    try {
      confirmed = await this.dialog.confirm({
        title: user.activo ? 'Desactivar usuario' : 'Activar usuario',
        message: this.statusConfirmMessage(user),
        confirmLabel: user.activo ? 'Desactivar' : 'Activar',
        tone: user.activo ? 'danger' : 'default',
      });
    } finally {
      this.confirmando = false;
    }
    if (confirmed) this.applyStatus(user);
  }

  private applyStatus(user: AdminUser): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.message.set('');
    this.service.updateStatus(user.id, !user.activo).subscribe({
      next: saved => {
        this.users.update(users => users.map(item => item.id === saved.id ? saved : item));
        this.notify.success(saved.activo ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.');
        this.saving.set(false);
        if (this.selectedUser()?.id === saved.id) this.populateEdit(saved);
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible actualizar el estado del usuario.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
    });
  }
}
