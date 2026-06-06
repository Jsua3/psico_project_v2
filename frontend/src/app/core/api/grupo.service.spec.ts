import { mapAgregarEstudianteError } from './grupo-error.utils';

describe('mapAgregarEstudianteError', () => {
  it('maps 404 to missing user message', () => {
    expect(mapAgregarEstudianteError({
      status: 404,
      error: { message: 'No existe un usuario con ese correo.' }
    })).toBe('No existe un usuario con ese correo.');
  });

  it('maps 400 role mismatch', () => {
    expect(mapAgregarEstudianteError({
      status: 400,
      error: { message: 'El usuario existe, pero no tiene rol estudiante.' }
    })).toBe('El usuario existe, pero no tiene rol estudiante.');
  });

  it('maps 400 inactive user', () => {
    expect(mapAgregarEstudianteError({
      status: 400,
      error: { message: 'El usuario está inactivo.' }
    })).toBe('El usuario está inactivo.');
  });

  it('maps 409 duplicate student', () => {
    expect(mapAgregarEstudianteError({
      status: 409,
      error: { message: 'El estudiante ya pertenece a este grupo.' }
    })).toBe('El estudiante ya pertenece a este grupo.');
  });

  it('maps 403 to permissions message', () => {
    expect(mapAgregarEstudianteError({ status: 403, error: {} })).toBe(
      'No tienes permisos para modificar este grupo.'
    );
  });

  it('maps unknown errors to generic retry message', () => {
    expect(mapAgregarEstudianteError({ status: 500, error: {} })).toBe(
      'No fue posible agregar el estudiante. Intenta nuevamente.'
    );
  });
});
