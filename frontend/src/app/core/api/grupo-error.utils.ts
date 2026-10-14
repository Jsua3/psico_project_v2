export interface AgregarEstudianteHttpError {
  status: number;
  error?: { message?: string } | null;
}

export function mapAgregarEstudianteError(err: AgregarEstudianteHttpError): string {
  const apiMessage = typeof err.error?.message === 'string' ? err.error.message.trim() : '';

  switch (err.status) {
    case 404:
      // D-14: el servidor no revela si una cuenta existe; un 404 al invitar es el GRUPO que ya no está.
      return 'El grupo ya no existe o no tienes acceso a él.';
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
