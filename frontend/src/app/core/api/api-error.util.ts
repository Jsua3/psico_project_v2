import { HttpErrorResponse } from '@angular/common/http';

/** Estados que `jwtInterceptor` ya comunica con su propio aviso. */
const HANDLED_BY_INTERCEPTOR = new Set([0, 401, 403]);

/**
 * Texto para mostrarle al usuario tras un error de la API, o `null` si el
 * interceptor ya avisó (sin conexión, sesión inválida, sin permisos, error no HTTP).
 */
export function apiErrorMessage(err: unknown, fallback: string): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  if (HANDLED_BY_INTERCEPTOR.has(err.status)) return null;
  const body = err.error as { message?: unknown; detail?: unknown } | null;
  for (const candidate of [body?.message, body?.detail]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}
