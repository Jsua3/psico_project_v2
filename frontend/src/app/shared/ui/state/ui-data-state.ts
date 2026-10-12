import { Signal, computed } from '@angular/core';

import { UiErrorKind } from './state-copy';

export type UiDataStateValue = 'loading' | 'error' | 'empty' | 'ready';

export interface UiDataStateSource {
  loading: Signal<boolean>;
  /** Cualquier valor verdadero es un error (un HttpErrorResponse, un mensaje…). */
  error: Signal<unknown>;
  isEmpty: Signal<boolean>;
}

/**
 * Estado ÚNICO de un bloque de datos (plan visual §2.5, F2-5): `loading` → `error` → `empty` → `ready`, en ese orden
 * de prioridad. El vacío y el error nunca coexisten; mientras se reintenta (carga con el error anterior aún puesto)
 * se ve la carga.
 */
export function uiDataState(source: UiDataStateSource): Signal<UiDataStateValue> {
  return computed(() => {
    if (source.loading()) return 'loading';
    if (source.error()) return 'error';
    return source.isEmpty() ? 'empty' : 'ready';
  });
}

/** Clase de error que se muestra según el código HTTP (0 = sin respuesta del servidor). */
export function errorKindFromStatus(status: number | null | undefined): UiErrorKind {
  if (status === 0) return 'network';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'server';
}
