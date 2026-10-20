import { HttpErrorResponse } from '@angular/common/http';
import { CSP_NONCE, Component, Input, Provider, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Screen {}

@Component({ selector: 'app-siep-particle-layer', template: '' })
class ParticlesStub {
  @Input() density = 'medium';
  @Input() interactive = false;
  @Input() mode = 'background';
  @Input() paused = false;
}

/**
 * Acceso (plan visual F4-2), en DOM: etiqueta visible en cada campo (H-29), errores al enviar y foco al primero,
 * botón que dice que trabaja y no envía dos veces, foco al encabezado al alternar formularios (nunca a body), fallo
 * de Google visible, aviso de alcance (RN-01) y una sola imagen de la escena.
 */
// req: BLOQUE-H (H-21, H-28, H-29), RNF-04, RN-01
describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let login: ReturnType<typeof vi.fn>;
  let googleConfig: () => Observable<{ enabled: boolean; clientId?: string }>;
  let requestAccess: (payload?: unknown) => Observable<unknown>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Texto que se lee de una etiqueta (sin el «*» decorativo de obligatorio, que es aria-hidden). */
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return text(copy);
  };
  const originalMatchMedia = window.matchMedia;

  async function render(extraProviders: Provider[] = []): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...extraProviders,
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { login, googleConfig: () => googleConfig(), requestAccess: (payload: unknown) => requestAccess(payload) } },
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(LoginComponent, { remove: { imports: [SiepParticleLayerComponent] }, add: { imports: [ParticlesStub] } });
    fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
  }

  const form = () => host().querySelector('form')!;
  const submit = () => form().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const button = (label: string) => [...host().querySelectorAll<HTMLButtonElement>('button')].find(b => text(b) === label)!;

  beforeEach(() => {
    login = vi.fn(() => of({}));
    requestAccess = () => of({});
    googleConfig = () => of({ enabled: false });
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('cada campo del formulario de entrada tiene etiqueta visible asociada (no solo placeholder)', async () => {
    await render();
    const labels = [...form().querySelectorAll('ui-field')].map(field => {
      const label = field.querySelector('label')!;
      return { label: spoken(label), control: !!form().querySelector(`#${label.getAttribute('for')}`) };
    });
    expect(labels).toEqual([{ label: 'Correo institucional', control: true }, { label: 'Contraseña', control: true }]);
  });

  it('al enviar vacío muestra todos los errores, lleva el foco al primero y no llama al servidor; el botón nunca se deshabilita por eso', async () => {
    await render();
    expect(submit().disabled).toBe(false);
    submit().click();
    await fixture.whenStable();
    expect(form().querySelectorAll('ui-field.ui-field--invalid')).toHaveLength(2);
    expect(document.activeElement).toBe(form().querySelector('input[type="email"]'));
    expect(login).not.toHaveBeenCalled();
  });

  it('mientras entra, el botón dice que trabaja (aria-busy) y un segundo clic no envía otra vez', async () => {
    const pending = new Subject<unknown>();
    login = vi.fn(() => pending);
    await render();
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
    submit().click();
    await fixture.whenStable();
    expect(submit().getAttribute('aria-busy')).toBe('true');
    submit().click();
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('alternar a «Solicitar acceso» deja UN formulario, con etiquetas, y lleva el foco a su encabezado; volver, igual', async () => {
    await render();
    button('Solicitar acceso').click();
    await fixture.whenStable();
    expect(host().querySelectorAll('form')).toHaveLength(1);
    expect(document.activeElement).toBe(host().querySelector('h1'));
    expect(text(host().querySelector('h1'))).toBe('Solicitar acceso');
    expect([...form().querySelectorAll('ui-field label')].map(spoken)).toEqual(['Nombre', 'Apellido', 'Correo institucional']);
    button('Ya tengo cuenta').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(host().querySelector('h1'));
    expect(text(host().querySelector('h1'))).toBe('Iniciar sesión');
  });

  it('«Recordar sesión» es una fila entera pulsable (ui-check) y el aviso de alcance (RN-01) está en el acceso', async () => {
    await render();
    const remember = form().querySelector('label.ui-check')!;
    expect(text(remember)).toBe('Recordar sesión');
    expect(remember.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(host().querySelector('ui-scope-notice')).not.toBeNull();
  });

  it('al recibir el foco tras enviar vacío, el campo ya dice que es inválido y por qué (revisión de F4, I-3)', async () => {
    await render();
    const email = form().querySelector<HTMLInputElement>('input[type="email"]')!;
    email.value = '';
    email.dispatchEvent(new Event('input'));
    let atFocus: { invalid: string | null; message: string } | null = null;
    email.addEventListener('focus', () => {
      const describedBy = email.getAttribute('aria-describedby') ?? '';
      atFocus = { invalid: email.getAttribute('aria-invalid'), message: describedBy.split(' ').map(id => text(host().querySelector(`#${id}`))).join(' ') };
    });
    submit().click();
    await fixture.whenStable();
    expect(atFocus).toEqual({ invalid: 'true', message: 'El correo es obligatorio.' });
  });

  it('una región de estado SIEMPRE presente anuncia «Ingresando…», «Enviando solicitud…» y el resultado (I-4, M-5)', async () => {
    const pending = new Subject<unknown>();
    login = vi.fn(() => pending);
    await render();
    const status = () => host().querySelector('.acceso__estado[role="status"]');
    expect(status()).not.toBeNull();
    expect(text(status())).toBe('');
    fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
    submit().click();
    await fixture.whenStable();
    expect(text(status())).toBe('Ingresando…');

    button('Solicitar acceso').click();
    await fixture.whenStable();
    fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
    submit().click();
    await fixture.whenStable();
    expect(text(status())).toBe('Solicitud enviada. El equipo académico revisará tu acceso y te contactará por correo.');
  });

  it('el botón de Google se vuelve a pintar al volver al formulario de entrada (revisión de F4, I-2)', async () => {
    const renderButton = vi.fn();
    (globalThis as { google?: unknown }).google = { accounts: { id: { initialize: vi.fn(), renderButton } } };
    googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
    try {
      await render();
      await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));
      button('Solicitar acceso').click();
      await fixture.whenStable();
      button('Ya tengo cuenta').click();
      await fixture.whenStable();
      await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(2));
      expect(renderButton.mock.calls[1][0]).toBe(host().querySelector('.acceso__google-btn'));
    } finally {
      delete (globalThis as { google?: unknown }).google;
    }
  });

  it('si el acceso con Google no carga, lo dice en vez de desaparecer en silencio', async () => {
    googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
    vi.spyOn(LoginComponent.prototype as unknown as { loadGoogleScript(): Promise<void> }, 'loadGoogleScript')
      .mockRejectedValue(new Error('sin red'));
    await render();
    await vi.waitFor(() => expect(text(host())).toContain('El acceso con Google no está disponible ahora.'));
  });

  // req: RNF-002 (S2-4: con la CSP en vigor, Google Identity Services copia el nonce de SU script a la hoja que inyecta)
  describe('script de Google bajo la política de contenido', () => {
    const gsiScript = () => document.getElementById('google-gsi-script') as HTMLScriptElement | null;
    // La prueba anterior de Google espía loadGoogleScript sin restaurarlo: aquí se necesita el método de verdad.
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => gsiScript()?.remove());

    it('lleva el nonce de la página (CSP_NONCE): sin él Google inyecta una hoja que la política bloquea', async () => {
      googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
      await render([{ provide: CSP_NONCE, useValue: 'nonce-de-la-pagina' }]);
      await vi.waitFor(() => expect(gsiScript()).not.toBeNull());
      expect(gsiScript()!.nonce || gsiScript()!.getAttribute('nonce')).toBe('nonce-de-la-pagina');
      expect(gsiScript()!.src).toBe('https://accounts.google.com/gsi/client');
    });

    it('control negativo: sin política (sin nonce) el script se pide igual y no lleva ninguno', async () => {
      googleConfig = () => of({ enabled: true, clientId: 'cliente-demo' });
      await render([{ provide: CSP_NONCE, useValue: null }]);
      await vi.waitFor(() => expect(gsiScript()).not.toBeNull());
      expect(gsiScript()!.nonce || gsiScript()!.getAttribute('nonce') || '').toBe('');
    });
  });

  // req: LW-17 (S1-3: campo trampa contra el envío automático de solicitudes de acceso)
  describe('campo trampa de la solicitud de acceso', () => {
    it('existe fuera de la tabulación y oculto a lectores de pantalla, y viaja vacío con la solicitud', async () => {
      const requestAccessSpy = vi.fn(() => of({}));
      requestAccess = requestAccessSpy;
      await render();
      button('Solicitar acceso').click();
      await fixture.whenStable();
      const trap = host().querySelector<HTMLInputElement>('#registro-sitio')!;
      expect(trap).not.toBeNull();
      expect(trap.tabIndex).toBe(-1);
      expect(trap.getAttribute('autocomplete')).toBe('off');
      expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(trap.value).toBe('');

      fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
      submit().click();
      await fixture.whenStable();
      expect(requestAccessSpy).toHaveBeenCalledWith({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
    });
  });

  // req: DJA-2 (S1-2: el limitador responde 429 con el texto y los segundos de espera)
  describe('429 del limitador', () => {
    const throttled = () => new HttpErrorResponse({
      status: 429, statusText: 'Too Many Requests',
      error: { success: false, code: 'THROTTLED', message: 'Demasiados intentos. Espera 40 s e inténtalo de nuevo.', retryAfter: 40 },
    });

    it('al entrar muestra el texto del servidor con la espera y deja volver a intentar', async () => {
      login = vi.fn(() => throwError(() => throttled()));
      await render();
      fixture.componentInstance.form.setValue({ email: 'ana@cue.edu.co', password: 'secreta', remember: false });
      submit().click();
      await fixture.whenStable();
      expect(text(host().querySelector('.acceso__error'))).toBe('Demasiados intentos. Espera 40 s e inténtalo de nuevo.');
      expect(submit().getAttribute('aria-busy')).not.toBe('true');
    });

    it('al solicitar acceso muestra el mismo texto en su propia región de error', async () => {
      requestAccess = () => throwError(() => throttled());
      await render();
      button('Solicitar acceso').click();
      await fixture.whenStable();
      fixture.componentInstance.registerForm.setValue({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@cue.edu.co', website: '' });
      submit().click();
      await fixture.whenStable();
      expect(text(host().querySelector('.acceso__error'))).toBe('Demasiados intentos. Espera 40 s e inténtalo de nuevo.');
    });
  });

  it('las partículas del panel se pueden pausar y reanudar (H-22, VD-25)', async () => {
    await render();
    const toggle = () => [...host().querySelectorAll<HTMLButtonElement>('.acceso__panel button')].find(b => /animación/.test(text(b)))!;
    const particles = () => fixture.debugElement.query(debug => debug.componentInstance instanceof ParticlesStub).componentInstance as ParticlesStub;
    expect(spoken(toggle())).toBe('Pausar animación');
    toggle().click();
    await fixture.whenStable();
    expect(spoken(toggle())).toBe('Reanudar animación');
    expect(particles().paused).toBe(true);
  });

  it('la escena del simulador se pinta una sola vez, en WebP y con el tamaño que pide la pantalla (srcset)', async () => {
    await render();
    const scenes = host().querySelectorAll<HTMLImageElement>('img[src*="login"]');
    expect(scenes).toHaveLength(1);
    expect(scenes[0].getAttribute('src')).toBe('assets/images/login/escena-acceso-640.webp');
    expect(scenes[0].getAttribute('srcset')).toBe('assets/images/login/escena-acceso-640.webp 640w, assets/images/login/escena-acceso-1280.webp 1280w');
    expect(scenes[0].getAttribute('sizes')).toBeTruthy();
    expect(scenes[0].getAttribute('loading')).toBe('lazy');
  });
});
