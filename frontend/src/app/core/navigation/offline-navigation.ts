import { inject } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';

/** Mensajes con que cada navegador (y webpack) avisa de que no pudo descargar un módulo perezoso. */
const LOAD_FAILURE = /ChunkLoadError|dynamically imported module|Importing a module script failed/i;

/**
 * ¿El error de navegación es la falta de red? (plan visual F4-3): la descarga del código de una ruta perezosa
 * falló, o el navegador dice que está sin conexión.
 */
export function isOfflineLoadError(error: unknown): boolean {
  const description = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  if (LOAD_FAILURE.test(description)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Manejador de errores de navegación (withNavigationErrorHandler): sin red, lleva a «Sin conexión» con la ruta
 * pedida para reintentar, sin cambiar la dirección visible. Siempre a la página de nivel superior, que se carga sin
 * código perezoso: una página dentro del portal necesitaría el shell, que sin red quizá tampoco llega (y el error
 * se repetiría en bucle). Los demás errores siguen su curso (undefined).
 */
export function offlineNavigationHandler(error: NavigationError): RedirectCommand | undefined {
  if (!isOfflineLoadError(error.error)) return undefined;
  const router = inject(Router);
  return new RedirectCommand(router.createUrlTree(['/sin-conexion'], { queryParams: { desde: error.url } }), {
    skipLocationChange: true,
  });
}
