import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NotificationService } from '../notifications/notification.service';
import { AuthService } from './auth.service';

export const SESSION_MESSAGE = 'Tu sesión ya no es válida o tu usuario está inactivo. Contacta al administrador.';
export const CONNECTION_MESSAGE = 'No fue posible conectar con el servidor. Intenta nuevamente.';
export const PERMISSION_MESSAGE = 'No tienes permisos para realizar esta acción.';

const LOGIN_URL = '/api/auth/login';
const ME_URL = '/api/auth/me';

/** Lo que cada eslabón necesita para decidir y actuar; se pasa entero para no acoplarlos a `inject()`. */
export interface HttpErrorContext {
  error: unknown;
  url: string;
  auth: Pick<AuthService, 'clearSession'>;
  router: Pick<Router, 'url' | 'navigate'>;
  notifications: Pick<NotificationService, 'error' | 'warning'>;
}

/**
 * Eslabón de la cadena de responsabilidad que atiende los errores HTTP: si reconoce el error lo
 * atiende y corta; si no, lo pasa al siguiente. El interceptor siempre vuelve a lanzar el error,
 * así que los eslabones solo producen efectos (avisar, cerrar sesión, navegar).
 */
export abstract class HttpErrorHandler {
  private next: HttpErrorHandler | null = null;

  setNext(next: HttpErrorHandler): HttpErrorHandler {
    this.next = next;
    return next;
  }

  handle(ctx: HttpErrorContext): void {
    if (this.canHandle(ctx)) {
      this.apply(ctx);
      return;
    }
    this.next?.handle(ctx);
  }

  protected abstract canHandle(ctx: HttpErrorContext): boolean;
  protected abstract apply(ctx: HttpErrorContext): void;
}

function statusOf(ctx: HttpErrorContext): number | null {
  return ctx.error instanceof HttpErrorResponse ? ctx.error.status : null;
}

/**
 * Sesión inválida: la limpia y, si no está ya en /login, avisa y lleva al login. Con `returnTo`, el acceso vuelve
 * luego a la pantalla en la que estaba (plan visual F3-6, H-34; el acceso valida la ruta).
 */
function expireSession(ctx: HttpErrorContext, returnTo = false): void {
  ctx.auth.clearSession();
  if (!ctx.router.url.startsWith('/login')) {
    ctx.notifications.warning(SESSION_MESSAGE);
    if (returnTo) ctx.router.navigate(['/login'], { queryParams: { returnUrl: ctx.router.url } });
    else ctx.router.navigate(['/login']);
  }
}

/** Algo que no es una respuesta HTTP (p. ej. lo lanzó otro interceptor): se trata como falta de conexión. */
export class NonHttpErrorHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return !(ctx.error instanceof HttpErrorResponse);
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.error(CONNECTION_MESSAGE);
  }
}

/** Los errores del login los muestra la propia pantalla: aquí solo se corta la cadena. */
export class LoginErrorHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return ctx.url.includes(LOGIN_URL);
  }
  protected apply(): void {}
}

export class UnauthorizedHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 401;
  }
  protected apply(ctx: HttpErrorContext): void {
    expireSession(ctx, true);
  }
}

/** Un 403 sobre /api/auth/me significa usuario inactivo: es sesión inválida, no falta de permisos. */
export class InactiveUserHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 403 && ctx.url.includes(ME_URL);
  }
  protected apply(ctx: HttpErrorContext): void {
    expireSession(ctx);
  }
}

export class ForbiddenHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 403;
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.warning(PERMISSION_MESSAGE);
  }
}

export class NoConnectionHandler extends HttpErrorHandler {
  protected canHandle(ctx: HttpErrorContext): boolean {
    return statusOf(ctx) === 0;
  }
  protected apply(ctx: HttpErrorContext): void {
    ctx.notifications.error(CONNECTION_MESSAGE);
  }
}

/** Orden contractual: el primero que reconoce el error lo atiende y los demás no se ejecutan. */
export function defaultHttpErrorHandlers(): HttpErrorHandler[] {
  return [
    new NonHttpErrorHandler(),
    new LoginErrorHandler(),
    new UnauthorizedHandler(),
    new InactiveUserHandler(),
    new ForbiddenHandler(),
    new NoConnectionHandler(),
  ];
}

/** Enlaza los eslabones en el orden dado y devuelve la cabeza de la cadena. */
export function buildHttpErrorChain(handlers: HttpErrorHandler[] = defaultHttpErrorHandlers()): HttpErrorHandler {
  const [head, ...rest] = handlers;
  rest.reduce<HttpErrorHandler>((previous, current) => previous.setNext(current), head);
  return head;
}
