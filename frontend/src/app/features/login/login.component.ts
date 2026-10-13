import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal,
  viewChild,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

import { EXPIRED_SESSION_REASON } from '../../core/auth/auth.guard';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/return-url';
import { APP_BRAND } from '../../core/config/brand.config';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCheck } from '../../shared/ui/field/ui-check';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';
import type { DemoCredentials } from './login-demo.dev';
import { LOGIN_ASSETS, LOGIN_PEDAGOGY_PILLARS, LOGIN_REMEMBER_EMAIL_KEY } from './login-assets.config';
import { findLoginRole, LOGIN_ROLES, LoginRole } from './login-role.config';

// Google Identity Services (cargado dinámicamente desde accounts.google.com/gsi/client)
declare const google: any;

/** Campos de cada formulario en el orden de la pantalla: al enviar con errores, el foco va al primero inválido. */
const SIGN_IN_FIELDS = [['email', 'login-email'], ['password', 'login-password']] as const;
const REQUEST_FIELDS = [['nombre', 'registro-nombre'], ['apellido', 'registro-apellido'], ['email', 'registro-email']] as const;

/**
 * Acceso (plan visual F4-2): un formulario a la vista (entrar o solicitar acceso) con etiqueta visible en cada campo
 * (ui-field, H-29) y borde de control (H-28); al enviar con errores se muestran todos y el foco va al primero; el
 * botón dice que trabaja (ui-button [loading]) y no envía dos veces; al alternar formularios el foco va al encabezado
 * del nuevo (nunca a body). Al lado, desde 64rem, un panel del simulador en la piel juego con UNA imagen.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatIconModule, PublicBarComponent, SiepParticleLayerComponent, UiButton, UiCheck, UiControl,
    UiField, UiScopeNotice,
  ],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.component.scss',
})
export class LoginComponent implements AfterViewInit {
  readonly brand = APP_BRAND;
  readonly roles = LOGIN_ROLES;
  readonly pedagogyPillars = LOGIN_PEDAGOGY_PILLARS;
  readonly loginHeroImage = LOGIN_ASSETS.images.hero;

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  /** La guardia mandó aquí porque la sesión venció (plan visual F3-6, H-34): se dice en la pantalla. */
  readonly sessionExpired = this.query.get('motivo') === EXPIRED_SESSION_REASON;

  /** Adónde volver al entrar: solo rutas internas (return-url.ts); si no, el panel. */
  private readonly destination = safeReturnUrl(this.query.get('returnUrl')) ?? '/portal/dashboard';

  /**
   * «Usar demo»: credenciales de la semilla, solo en desarrollo (RNF-01, VD-22). Se cargan con import() dentro de
   * ngDevMode, que el build de producción pliega: el módulo no llega al dist (check-dist-dev-only lo comprueba).
   */
  readonly demo = signal<Readonly<Record<LoginRole, DemoCredentials>> | null>(null);

  readonly selectedRole = signal<LoginRole>('ESTUDIANTE');
  readonly activeRole = computed(() => findLoginRole(this.selectedRole()));
  readonly showRegister = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  // ── Google Identity Services ──────────────────────────────────────────────
  readonly googleBtn = viewChild<ElementRef<HTMLDivElement>>('googleBtn');
  readonly googleEnabled = signal(false);
  readonly googleLoading = signal(false);
  /** Google estaba configurado pero no cargó: se dice, no desaparece en silencio. */
  readonly googleUnavailable = signal(false);
  private googleInitialized = false;

  readonly registerNotice = signal('');
  readonly registerLoading = signal(false);
  readonly registerError = signal('');

  /** Encabezado del formulario visible: recibe el foco al alternar. */
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly form = this.fb.nonNullable.group({
    email: [this.loadRememberedEmail(), [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [true],
  });

  readonly registerForm = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    // El build de producción pliega ngDevMode a false y descarta la rama: el import() y su chunk no existen.
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      void import('./login-demo.dev').then(module => this.demo.set(module.LOGIN_DEMO_CREDENTIALS));
    }
  }

  /** Mensaje de error de un campo, solo cuando ya se tocó o se intentó enviar. */
  fieldError(control: AbstractControl, messages: { required: string; email?: string }): string | null {
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) return messages.required;
    if (control.hasError('email') && messages.email) return messages.email;
    return null;
  }

  selectRole(role: LoginRole): void {
    this.selectedRole.set(role);
    this.error.set('');
    const demo = this.demo();
    if (!demo) return;
    const currentEmail = this.form.controls.email.value.trim().toLowerCase();
    const knownDemoEmails = new Set(Object.values(demo).map(credentials => credentials.email));
    if (!currentEmail || knownDemoEmails.has(currentEmail)) this.form.controls.email.setValue(demo[role].email);
  }

  openSignIn(): void {
    this.showRegister.set(false);
    this.registerNotice.set('');
    this.registerError.set('');
    this.focusHeading();
  }

  openSignUp(): void {
    this.showRegister.set(true);
    this.error.set('');
    this.registerNotice.set('');
    this.registerError.set('');
    this.selectedRole.set('ESTUDIANTE');
    this.focusHeading();
  }

  fillDemoCredentials(): void {
    const credentials = this.demo()?.[this.selectedRole()];
    if (!credentials) return;
    this.form.patchValue({ email: credentials.email, password: credentials.password });
  }

  ngAfterViewInit(): void {
    // Pide el client id público; si está configurado, monta el botón de Google.
    this.auth.googleConfig().subscribe({
      next: cfg => {
        if (cfg.enabled && cfg.clientId) this.setupGoogle(cfg.clientId);
      },
      error: () => { /* Google opcional y sin configurar: no se ofrece */ },
    });
  }

  onSubmit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid(this.form.controls, SIGN_IN_FIELDS);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    const { email, password, remember } = this.form.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (remember) localStorage.setItem(LOGIN_REMEMBER_EMAIL_KEY, normalizedEmail);
      else localStorage.removeItem(LOGIN_REMEMBER_EMAIL_KEY);
    } catch { /* almacenamiento bloqueado: se entra igual */ }

    this.auth.login(normalizedEmail, password).subscribe({
      next: () => this.router.navigateByUrl(this.destination),
      error: (error: unknown) => {
        this.error.set(this.loginErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  onRegisterSubmit(): void {
    if (this.registerLoading()) return;
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.focusFirstInvalid(this.registerForm.controls, REQUEST_FIELDS);
      return;
    }

    const { nombre, apellido, email } = this.registerForm.getRawValue();
    this.registerLoading.set(true);
    this.registerNotice.set('');
    this.registerError.set('');
    this.auth.requestAccess({ nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim().toLowerCase() }).subscribe({
      next: response => {
        this.registerNotice.set(
          response.message ?? 'Solicitud enviada. El equipo académico revisará tu acceso y te contactará por correo.',
        );
        this.registerLoading.set(false);
        this.registerForm.reset({ nombre: '', apellido: '', email: '' });
      },
      error: (error: unknown) => {
        this.registerError.set(this.registerErrorMessage(error));
        this.registerLoading.set(false);
      },
    });
  }

  /** Tras pintar el formulario nuevo, el foco va a su encabezado (no cae a body con el que desaparece). */
  private focusHeading(): void {
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstInvalid(controls: Record<string, AbstractControl>, fields: ReadonlyArray<readonly [string, string]>): void {
    const first = fields.find(([name]) => controls[name]?.invalid);
    if (first) document.getElementById(first[1])?.focus();
  }

  private setupGoogle(clientId: string): void {
    this.loadGoogleScript()
      .then(() => {
        if (typeof google === 'undefined' || !google.accounts?.id) {
          this.googleUnavailable.set(true);
          return;
        }
        if (!this.googleInitialized) {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: { credential: string }) => this.onGoogleCredential(response),
          });
          this.googleInitialized = true;
        }
        this.googleEnabled.set(true);
        afterNextRender(() => {
          const host = this.googleBtn()?.nativeElement;
          if (!host) return;
          host.innerHTML = '';
          google.accounts.id.renderButton(host, {
            theme: 'outline', size: 'large', type: 'standard', text: 'continue_with', shape: 'pill',
            logo_alignment: 'left', width: 320,
          });
        }, { injector: this.injector });
      })
      .catch(() => {
        this.googleEnabled.set(false);
        this.googleUnavailable.set(true);
      });
  }

  private loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts?.id) {
        resolve();
        return;
      }
      const existing = document.getElementById('google-gsi-script') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
  }

  private onGoogleCredential(response: { credential: string }): void {
    if (!response?.credential || this.googleLoading()) return;
    this.googleLoading.set(true);
    this.error.set('');
    this.auth.loginWithGoogle(response.credential).subscribe({
      next: () => this.router.navigateByUrl(this.destination),
      error: (error: unknown) => {
        this.error.set(this.googleErrorMessage(error));
        this.googleLoading.set(false);
      },
    });
  }

  private googleErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No fue posible conectar con Google. Intenta nuevamente.';
    if (error.status === 401 || error.status === 403) {
      return 'Esa cuenta de Google no está registrada o está inactiva. Solicita acceso o usa tu correo y contraseña.';
    }
    return error.error?.message || 'No fue posible iniciar sesión con Google. Intenta nuevamente.';
  }

  private registerErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No fue posible enviar la solicitud. Intenta nuevamente en unos minutos.';
    return error.error?.message || 'No fue posible enviar la solicitud. Intenta nuevamente en unos minutos.';
  }

  private loadRememberedEmail(): string {
    try {
      return localStorage.getItem(LOGIN_REMEMBER_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private loginErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No fue posible conectar con el servidor. Intenta nuevamente.';
    if (error.status === 401) return 'Correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente.';
    if (error.status === 403) return 'Tu usuario está inactivo o no tiene permisos para ingresar. Contacta al administrador.';
    if (error.status === 0) return 'No fue posible conectar con el servidor. Intenta nuevamente.';
    return 'No fue posible iniciar sesión. Intenta nuevamente.';
  }
}
