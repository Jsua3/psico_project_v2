import { ErrorHandler, Injectable, signal } from '@angular/core';

export interface UnhandledErrorState {
  readonly message: string;
  readonly timestamp: number;
}

const BENIGN_BROWSER_PATTERNS = [
  /ResizeObserver loop/i,
  /AbortError/i,
];

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Ocurrió un error inesperado en la aplicación.';
}

/**
 * Manejador global de errores de cliente (E5-8 · ANG-8).
 * Registra el error sin tragarlo y expone un estado recuperable (`lastUnhandledError` + `dismiss`)
 * sin saturar la interfaz ante avisos benignos del navegador (p. ej. ResizeObserver).
 */
@Injectable({ providedIn: 'root' })
export class SiepErrorHandler implements ErrorHandler {
  private readonly _lastError = signal<UnhandledErrorState | null>(null);
  readonly lastUnhandledError = this._lastError.asReadonly();

  handleError(error: unknown): void {
    console.error('[SIEP:UnhandledError]', error);
    const message = extractErrorMessage(error);
    if (BENIGN_BROWSER_PATTERNS.some(pattern => pattern.test(message))) {
      return;
    }
    this._lastError.set({
      message,
      timestamp: Date.now(),
    });
  }

  dismiss(): void {
    this._lastError.set(null);
  }
}
