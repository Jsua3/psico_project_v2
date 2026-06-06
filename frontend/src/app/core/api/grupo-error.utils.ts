export interface AgregarEstudianteHttpError {
  status: number;
  error?: { message?: string } | null;
}

export function mapAgregarEstudianteError(err: AgregarEstudianteHttpError): string {
  const apiMessage = typeof err.error?.message === 'string' ? err.error.message.trim() : '';

  switch (err.status) {
    case 404:
      return 'No existe un usuario con ese correo.';
    case 400:
      if (apiMessage.includes('rol estudiante')) {
        return 'El usuario existe, pero no tiene rol estudiante.';
      }
      if (apiMessage.includes('inactivo')) {
        return 'El usuario está inactivo.';
      }
      return apiMessage || 'No fue posible agregar el estudiante. Intenta nuevamente.';
    case 409:
      return 'El estudiante ya pertenece a este grupo.';
    case 403:
      return 'No tienes permisos para modificar este grupo.';
    default:
      return 'No fue posible agregar el estudiante. Intenta nuevamente.';
  }
}
