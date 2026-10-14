import { HttpErrorResponse } from '@angular/common/http';

import {
  CONNECTION_MESSAGE,
  HttpErrorContext,
  HttpErrorHandler,
  PERMISSION_MESSAGE,
  SESSION_MESSAGE,
  buildHttpErrorChain,
  defaultHttpErrorHandlers,
} from './http-error-chain';

/** Pruebas de la cadena de eslabones de errores HTTP (P-08b). Sin TestBed ni HttpClient. */
describe('cadena de errores HTTP', () => {
  let ctxBase: Omit<HttpErrorContext, 'error' | 'url'>;
  let auth: { clearSession: ReturnType<typeof vi.fn>; requirePasswordChange: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };
  let notifications: { error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { clearSession: vi.fn(), requirePasswordChange: vi.fn() };
    router = { url: '/dashboard', navigate: vi.fn() };
    notifications = { error: vi.fn(), warning: vi.fn() };
    ctxBase = { auth: auth as never, router: router as never, notifications: notifications as never };
  });

  const http = (status: number) => new HttpErrorResponse({ status, statusText: 'err' });
  const run = (error: unknown, url = '/api/cosa') => buildHttpErrorChain().handle({ ...ctxBase, error, url });
  const effects = () => ({
    clear: auth.clearSession.mock.calls.length,
    nav: router.navigate.mock.calls.length,
    err: notifications.error.mock.calls.length,
    warn: notifications.warning.mock.calls.length,
  });

  it('el orden contractual de los eslabones', () => {
    expect(defaultHttpErrorHandlers().map(h => h.constructor.name)).toEqual([
      'NonHttpErrorHandler',
      'LoginErrorHandler',
      'UnauthorizedHandler',
      'InactiveUserHandler',
      'PasswordChangeRequiredHandler',
      'ForbiddenHandler',
      'NoConnectionHandler',
    ]);
  });

  // req: RN-10 (E2-9: hasta cambiar la contraseña temporal, el servidor responde 403 PASSWORD_CHANGE_REQUIRED a todo)
  describe('cambio de contraseña obligatorio', () => {
    const passwordChange = () => new HttpErrorResponse({
      status: 403, statusText: 'Forbidden',
      error: { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña temporal antes de continuar.' },
    });

    it('lleva a «Cambia tu contraseña» con la ruta en la que estaba, sin «No tienes permisos» ni cerrar la sesión', () => {
      router.url = '/portal/grupos?pagina=2';
      run(passwordChange(), '/api/grupos');
      expect(auth.requirePasswordChange).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/cambiar-contrasena'], { queryParams: { returnUrl: '/portal/grupos?pagina=2' } });
      expect(effects()).toEqual({ clear: 0, nav: 1, err: 0, warn: 0 });
    });

    it('estando ya en «Cambia tu contraseña» no vuelve a navegar', () => {
      router.url = '/cambiar-contrasena?returnUrl=%2Fportal%2Fgrupos';
      run(passwordChange(), '/api/grupos');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('un 403 con otro código sigue siendo falta de permisos', () => {
      run(new HttpErrorResponse({ status: 403, error: { code: 'FORBIDDEN', message: 'No tiene permisos' } }));
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(auth.requirePasswordChange).not.toHaveBeenCalled();
    });
  });

  describe('cada eslabón atiende lo suyo', () => {
    it('un error que no es HTTP avisa de conexión', () => {
      run(new Error('boom'));
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it('401: limpia la sesión, avisa y navega al login recordando dónde estaba (returnUrl, plan visual F3-6 / H-34)', () => {
      router.url = '/portal/grupos?pagina=2';
      run(http(401));
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/portal/grupos?pagina=2' } });
      expect(effects()).toEqual({ clear: 1, nav: 1, err: 0, warn: 1 });
    });

    it('401 estando en /login: limpia la sesión sin avisar ni navegar', () => {
      router.url = '/login?next=%2Fa';
      run(http(401));
      expect(effects()).toEqual({ clear: 1, nav: 0, err: 0, warn: 0 });
    });

    it('403 en /api/auth/me es sesión inválida, no falta de permisos (sin returnUrl: un usuario inactivo no vuelve)', () => {
      run(http(403), '/api/auth/me');
      expect(notifications.warning).toHaveBeenCalledWith(SESSION_MESSAGE);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(effects()).toEqual({ clear: 1, nav: 1, err: 0, warn: 1 });
    });

    it('403 en /api/auth/me estando en /login no avisa ni navega', () => {
      router.url = '/login';
      run(http(403), '/api/auth/me');
      expect(effects()).toEqual({ clear: 1, nav: 0, err: 0, warn: 0 });
    });

    it('403 en otra ruta avisa de permisos y conserva la sesión', () => {
      run(http(403));
      expect(notifications.warning).toHaveBeenCalledWith(PERMISSION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 1 });
    });

    it('status 0 avisa de conexión y conserva la sesión', () => {
      run(http(0));
      expect(notifications.error).toHaveBeenCalledWith(CONNECTION_MESSAGE);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it.each([400, 404, 409, 422, 500])('el %i no lo atiende nadie', status => {
      run(http(status));
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });
  });

  describe('el primero que reconoce el error corta la cadena', () => {
    it.each([0, 401, 403, 500])('en el login el %i no produce efectos aunque otro eslabón lo reconocería', status => {
      run(http(status), '/api/auth/login');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('un error no HTTP en el login igual avisa (el eslabón no-HTTP va antes)', () => {
      run(new Error('boom'), '/api/auth/login');
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 1, warn: 0 });
    });

    it('403 en /me no pasa además por el eslabón de permisos', () => {
      run(http(403), '/api/auth/me');
      expect(notifications.warning).toHaveBeenCalledTimes(1);
      expect(notifications.warning).not.toHaveBeenCalledWith(PERMISSION_MESSAGE);
    });

    it('un solo eslabón actúa por error: el 401 limpia la sesión una sola vez', () => {
      run(http(401));
      expect(auth.clearSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('la cadena es extensible', () => {
    class Spy extends HttpErrorHandler {
      calls = 0;
      constructor(private readonly status: number) {
        super();
      }
      protected canHandle(ctx: HttpErrorContext): boolean {
        return ctx.error instanceof HttpErrorResponse && ctx.error.status === this.status;
      }
      protected apply(): void {
        this.calls++;
      }
    }

    it('un eslabón nuevo se agrega sin tocar los demás y recibe solo lo suyo', () => {
      const teapot = new Spy(418);
      const chain = buildHttpErrorChain([...defaultHttpErrorHandlers(), teapot]);
      chain.handle({ ...ctxBase, error: http(418), url: '/api/cosa' });
      chain.handle({ ...ctxBase, error: http(500), url: '/api/cosa' });
      expect(teapot.calls).toBe(1);
      expect(effects()).toEqual({ clear: 0, nav: 0, err: 0, warn: 0 });
    });

    it('un eslabón puesto antes tapa a los siguientes', () => {
      const early = new Spy(401);
      buildHttpErrorChain([early, ...defaultHttpErrorHandlers()]).handle({ ...ctxBase, error: http(401), url: '/api/cosa' });
      expect(early.calls).toBe(1);
      expect(auth.clearSession).not.toHaveBeenCalled();
    });

    it('con un solo eslabón la cadena funciona y lo que no reconoce se ignora', () => {
      const only = new Spy(1);
      const chain = buildHttpErrorChain([only]);
      chain.handle({ ...ctxBase, error: http(2), url: '/x' });
      expect(only.calls).toBe(0);
    });

    it('setNext devuelve el eslabón recibido para poder encadenar', () => {
      const a = new Spy(1);
      const b = new Spy(2);
      expect(a.setNext(b)).toBe(b);
    });
  });
});
