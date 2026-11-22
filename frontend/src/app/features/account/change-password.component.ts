import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api/api-error.util';
import { AuthService } from '../../core/auth/auth.service';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/password-change';
import { safeReturnUrl } from '../../core/auth/return-url';
import { NotificationService } from '../../core/notifications/notification.service';
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { TemaService } from '../../core/tema/tema.service';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';

type PasswordField = 'currentPassword' | 'newPassword';

/** La confirmación repite la nueva contraseña (error en el grupo: `mismatch`). */
function sameNewPassword(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return confirm && next !== confirm ? { mismatch: true } : null;
}

/**
 * «Cambia tu contraseña» (plan visual F7b-2; E2-9, RN-10). Una cuenta aprobada por el administrador entra con una
 * contraseña temporal y el servidor le responde 403 `PASSWORD_CHANGE_REQUIRED` a todo salvo `/api/auth/**`: el portal
 * la manda aquí (`passwordChangeGuard` y la cadena de errores) con la ruta pedida. Vive FUERA del portal (su propio
 * `<main>`, sin barra ni destinos que el servidor negaría). Mínimo de 10 caracteres como el servidor; sus errores salen
 * en el campo que nombra (`field`). «Cerrar sesión» siempre a mano: quien no recuerde la temporal no queda atrapado.
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, PublicBarComponent, UiButton, UiControl, UiField, UiPageHeader],
  // Los eventos del formulario notifican a OnPush los cambios de validación.
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modo() === 'forzado') {
      <div class="publico cambio-publico" [attr.data-skin]="tema.piel()">
        <app-public-bar mode="acceso" />
        <main id="main-content" tabindex="-1" class="cambio cambio--publico">
          <div class="cambio__tarjeta pub-vidrio">
            <ui-page-header eyebrow="Tu cuenta" [title]="title()" [description]="description()" />
            <ng-container [ngTemplateOutlet]="contenido" />
          </div>
        </main>
      </div>
    } @else {
      <section class="cambio">
        <ui-page-header [title]="title()" [description]="description()" volverA="/portal/dashboard" volverEtiqueta="Volver al inicio" />
        <ng-container [ngTemplateOutlet]="contenido" />
      </section>
    }
    <ng-template #contenido>
      <p class="ds-sr-only" role="status">{{ statusText() }}</p>
      @if (guardado()) {
        <p id="cambio-confirmacion" class="cambio__ok" tabindex="-1">Contraseña actualizada.</p>
        <a ui-button routerLink="/portal/dashboard">Volver al inicio</a>
      } @else {
      <form class="cambio__form" [formGroup]="form" novalidate (ngSubmit)="submit()">
        <ui-field [label]="modo() === 'forzado' ? 'Contraseña temporal' : 'Contraseña actual'" required revealable [error]="errorOf('currentPassword')">
          <input uiControl id="cambio-actual" type="password" formControlName="currentPassword" autocomplete="current-password" />
        </ui-field>
        <ui-field label="Nueva contraseña" required revealable [error]="errorOf('newPassword')">
          <input uiControl id="cambio-nueva" type="password" formControlName="newPassword" autocomplete="new-password" aria-describedby="cambio-requisitos" />
        </ui-field>
        <ul id="cambio-requisitos" class="cambio__requisitos" aria-label="Requisitos de la nueva contraseña">
          <li [class.cumplido]="tieneLongitud()"><span aria-hidden="true">{{ tieneLongitud() ? '✓' : '○' }}</span> Al menos 10 caracteres<span class="ds-sr-only">{{ tieneLongitud() ? ': cumplido' : ': pendiente' }}</span></li>
          <li [class.cumplido]="noSoloNumeros()"><span aria-hidden="true">{{ noSoloNumeros() ? '✓' : '○' }}</span> No solo números<span class="ds-sr-only">{{ noSoloNumeros() ? ': cumplido' : ': pendiente' }}</span></li>
          <li><span aria-hidden="true">○</span> Que no sea una contraseña común (se comprueba al guardar)</li>
        </ul>
        <ui-field label="Repite la nueva contraseña" required revealable [error]="confirmError()">
          <input uiControl id="cambio-confirmar" type="password" formControlName="confirmPassword" autocomplete="new-password" />
        </ui-field>

        @if (formError()) {
          <p class="cambio__error">{{ formError() }}</p>
        }

        <div class="cambio__actions">
          <button ui-button type="submit" icon="lock" [loading]="saving()">{{ saving() ? 'Guardando…' : 'Guardar contraseña' }}</button>
          @if (modo() === 'forzado') { <button ui-button type="button" variant="ghost" (click)="logout()">Cerrar sesión</button> }
        </div>
      </form>
      }
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .cambio {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-5);
      max-width: 32rem;
      margin-inline: auto;
      padding: var(--ds-space-8) var(--ds-space-4);
    }
    .cambio-publico { min-height: 100vh; }
    .cambio--publico { padding-top: calc(var(--asb-alto-modulo-superior) + var(--ds-space-8)); }
    .cambio__tarjeta { display: grid; gap: var(--ds-space-5); padding: var(--ds-space-6); min-width: 0; }
    .cambio__requisitos { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--ds-space-1); color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); }
    .cambio__requisitos .cumplido { color: var(--ds-success, var(--ds-text-1)); }
    @media (forced-colors: active) { .cambio__tarjeta { border: 1px solid CanvasText; } }
    .cambio__form {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ds-space-4);
    }
    .cambio__ok { margin: 0; color: var(--ds-text-1); font-weight: var(--ds-type-h3-weight); }
    .cambio__ok:focus-visible { outline: 2px solid var(--ds-focus, var(--ds-primary)); outline-offset: 2px; }
    .cambio__error {
      margin: 0;
      color: var(--ds-danger);
      font-weight: var(--ds-type-h3-weight);
      font-size: var(--ds-type-body-s-size);
      line-height: var(--ds-type-body-s-line);
    }
    .cambio__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-3);
    }
  `],
})
export class ChangePasswordComponent {
  readonly modo = input('forzado' as 'forzado' | 'voluntario', { transform: (valor: 'forzado' | 'voluntario' | undefined) => valor === 'voluntario' ? 'voluntario' : 'forzado' });
  protected readonly tema = inject(TemaService);
  protected readonly guardado = signal(false);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destination =
    safeReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl')) ?? '/portal/dashboard';

  readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    confirmPassword: ['', Validators.required],
  }, { validators: sameNewPassword });

  constructor() { this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.cdr.markForCheck()); }
  protected tieneLongitud(): boolean { return this.form.controls.newPassword.value.length >= PASSWORD_MIN_LENGTH; }
  protected noSoloNumeros(): boolean { const value = this.form.controls.newPassword.value; return !!value && !/^\d+$/.test(value); }

  protected readonly saving = signal(false);
  /** Lo que el servidor dijo de un campo (`field` del error): se muestra en ese campo, no en un aviso suelto. */
  private readonly serverErrors = signal<Partial<Record<PasswordField, string>>>({});
  protected readonly formError = signal('');
  protected readonly statusText = computed(() => {
    if (this.saving()) return 'Guardando tu nueva contraseña…';
    return this.guardado() ? 'Contraseña actualizada.' : this.formError();
  });

  protected readonly title = computed(() =>
    this.modo() === 'forzado' ? 'Elige tu contraseña' : 'Cambia tu contraseña');
  protected readonly description = computed(() => this.modo() === 'forzado' && this.auth.mustChangePassword()
    ? 'Tu cuenta tiene una contraseña temporal. Elige una propia para entrar.'
    : 'Elige una nueva contraseña para tu cuenta.');

  protected errorOf(field: PasswordField): string | null {
    const control = this.form.controls[field];
    if (control.touched && control.hasError('required')) {
      return field === 'currentPassword' ? 'Escribe tu contraseña actual.' : 'Escribe la nueva contraseña.';
    }
    if (control.touched && control.hasError('minlength')) {
      return `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    }
    return this.serverErrors()[field] ?? null;
  }

  protected confirmError(): string | null {
    const control = this.form.controls.confirmPassword;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Repite la nueva contraseña.';
    return this.form.hasError('mismatch') ? 'Las contraseñas no coinciden.' : null;
  }

  submit(): void {
    if (this.saving()) return;
    this.serverErrors.set({});
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // La confirmación que no coincide marca el GRUPO: el foco va a ella.
      const target = this.form.hasError('mismatch') && this.form.controls.confirmPassword.valid
        ? this.host.nativeElement.querySelector<HTMLElement>('#cambio-confirmar')
        : null;
      if (target) target.focus();
      else focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.saving.set(true);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.auth.markPasswordChanged();
        if (this.modo() === 'voluntario') {
          this.guardado.set(true);
          // El formulario (y el botón con el foco) desaparece: se pinta ya la confirmación y el foco va a ella. El
          // anuncio lo da la región `status` de arriba, que existe desde el principio y solo cambia de texto.
          this.cdr.detectChanges();
          this.host.nativeElement.querySelector<HTMLElement>('#cambio-confirmacion')?.focus();
        } else {
          this.notify.success('Contraseña actualizada.');
          void this.router.navigateByUrl(this.destination);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const field = (err instanceof HttpErrorResponse ? (err.error as { field?: unknown } | null)?.field : null) as PasswordField | null;
        const message = apiErrorMessage(err, 'No fue posible cambiar la contraseña. Inténtalo de nuevo.');
        if (message && (field === 'currentPassword' || field === 'newPassword')) {
          this.serverErrors.set({ [field]: message });
          this.host.nativeElement.querySelector<HTMLElement>(field === 'currentPassword' ? '#cambio-actual' : '#cambio-nueva')?.focus();
        } else if (message) {
          this.formError.set(message);
        }
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
