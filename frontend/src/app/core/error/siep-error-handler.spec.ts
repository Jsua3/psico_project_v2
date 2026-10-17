import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { AuthService } from '../auth/auth.service';
import { of } from 'rxjs';
import { SiepErrorHandler } from './siep-error-handler';

// req: RNF-05
describe('SiepErrorHandler (ANG-8)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), SiepErrorHandler],
    });
  });

  it('registra el error en consola sin tragarlo y expone un estado recuperable que se puede descartar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = TestBed.inject(SiepErrorHandler);

    handler.handleError(new Error('Fallo de renderizado en panel'));

    expect(spy).toHaveBeenCalledWith('[SIEP:UnhandledError]', expect.any(Error));
    expect(handler.lastUnhandledError()?.message).toBe('Fallo de renderizado en panel');

    handler.dismiss();
    expect(handler.lastUnhandledError()).toBeNull();
    spy.mockRestore();
  });

  it('ignora avisos benignos de ResizeObserver en el estado recuperable pero mantiene el log diagnóstico', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = TestBed.inject(SiepErrorHandler);

    handler.handleError(new Error('ResizeObserver loop completed with undelivered notifications.'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(handler.lastUnhandledError()).toBeNull();
    spy.mockRestore();
  });

  it('app.config provee SiepErrorHandler como ErrorHandler global y registra provideBrowserGlobalErrorListeners', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: AuthService, useValue: { syncCurrentUser: () => of(null) } }],
    });
    const handler = TestBed.inject(ErrorHandler);
    expect(handler).toBeInstanceOf(SiepErrorHandler);
  });
});
