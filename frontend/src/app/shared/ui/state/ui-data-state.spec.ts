import { signal } from '@angular/core';

import { errorKindFromStatus, uiDataState } from './ui-data-state';

/**
 * uiDataState() (plan visual §2.5, F2-5; Review Focus 4): UN solo estado por bloque de datos. El vacío y el error
 * no pueden coexistir (hoy usuarios, catálogo y reportes los muestran a la vez).
 */
describe('uiDataState', () => {
  it('nunca devuelve vacío y error a la vez: el error gana al vacío', () => {
    const state = uiDataState({ loading: signal(false), error: signal(new Error('500')), isEmpty: signal(true) });
    expect(state()).toBe('error');
  });

  it('mientras carga (también al reintentar con el error anterior aún puesto) dice «loading»', () => {
    const state = uiDataState({ loading: signal(true), error: signal('fallo previo'), isEmpty: signal(true) });
    expect(state()).toBe('loading');
  });

  it('sin error ni carga: vacío o listo según los datos, y sigue a las señales', () => {
    const isEmpty = signal(true);
    const error = signal<unknown>(null);
    const state = uiDataState({ loading: signal(false), error, isEmpty });
    expect(state()).toBe('empty');
    isEmpty.set(false);
    expect(state()).toBe('ready');
    error.set({ status: 0 });
    expect(state()).toBe('error');
  });
});

describe('errorKindFromStatus', () => {
  it('traduce el código HTTP a la clase de error que se muestra', () => {
    expect(errorKindFromStatus(0)).toBe('network');
    expect(errorKindFromStatus(401)).toBe('forbidden');
    expect(errorKindFromStatus(403)).toBe('forbidden');
    expect(errorKindFromStatus(404)).toBe('not-found');
    expect(errorKindFromStatus(500)).toBe('server');
    expect(errorKindFromStatus(undefined)).toBe('server');
  });
});
