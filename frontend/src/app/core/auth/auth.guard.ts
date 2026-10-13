import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/** Motivo que el acceso explica en pantalla (plan visual F3-6, H-34). */
export const EXPIRED_SESSION_REASON = 'sesion-expirada';

/**
 * Sin sesión válida: la limpia y manda al acceso con la ruta pedida (`returnUrl`, que el acceso valida) y, si la
 * sesión existía pero venció o está rota, con `motivo=sesion-expirada`. El aviso lo da el acceso en la pantalla (no
 * un aviso flotante que se va solo); null si la sesión es válida.
 */
function loginRedirect(auth: AuthService, router: Router, url: string): UrlTree | null {
  const token = auth.getToken();
  if (token && !auth.isTokenMalformed(token) && !auth.isTokenExpired(token)) return null;
  auth.clearSession();
  const queryParams = token ? { returnUrl: url, motivo: EXPIRED_SESSION_REASON } : { returnUrl: url };
  return router.createUrlTree(['/login'], { queryParams });
}

export const authGuard: CanActivateFn = (_route, state) =>
  loginRedirect(inject(AuthService), inject(Router), state.url) ?? true;

export const roleGuard = (...roles: string[]): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const redirect = loginRedirect(auth, router, state.url);
  if (redirect) return redirect;

  if (auth.hasRole(...roles)) return true;
  // Plan visual F4-3: la negación se ve (página «Sin permiso» con la sección pedida), no es una redirección muda.
  return router.createUrlTree(['/portal/sin-permiso'], { queryParams: { desde: state.url } });
};
