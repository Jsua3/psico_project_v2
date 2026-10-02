import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from './api-error.util';

function httpError(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

describe('apiErrorMessage', () => {
  it('usa el mensaje del backend', () => {
    expect(apiErrorMessage(httpError(400, { message: 'El código ya existe.' }), 'Respaldo')).toBe('El código ya existe.');
  });

  it('usa detail cuando no hay message (DRF)', () => {
    expect(apiErrorMessage(httpError(404, { detail: 'No encontrado.' }), 'Respaldo')).toBe('No encontrado.');
  });

  it('usa el respaldo si el cuerpo no trae texto', () => {
    expect(apiErrorMessage(httpError(500, null), 'No fue posible guardar.')).toBe('No fue posible guardar.');
    expect(apiErrorMessage(httpError(400, { message: '   ' }), 'Respaldo')).toBe('Respaldo');
  });

  it('devuelve null cuando el interceptor ya avisó', () => {
    for (const status of [0, 401, 403]) {
      expect(apiErrorMessage(httpError(status, { message: 'x' }), 'Respaldo')).toBeNull();
    }
    expect(apiErrorMessage(new Error('boom'), 'Respaldo')).toBeNull();
  });
});
