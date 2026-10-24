import type { CasoBorrador } from './caso';

export type TipoAviso = 'sin-salida' | 'inalcanzable' | 'sin-final' | 'respuesta-sin-destino' | 'sin-inicio';

export interface Aviso {
  tipo: TipoAviso;
  escenaId: string | null;
  respuestaId?: string;
  mensaje: string;
}

/** Nombre corto de cada aviso, para la etiqueta en el mapa. */
export const NOMBRE_AVISO: Record<TipoAviso, string> = {
  'sin-salida': 'Sin salida',
  inalcanzable: 'No se llega',
  'sin-final': 'Sin final',
  'respuesta-sin-destino': 'Respuesta sin destino',
  'sin-inicio': 'Sin inicio',
};

/** Revisa los caminos del caso (se completa en la tarea de avisos). */
export function revisarCaminos(_caso: CasoBorrador): Aviso[] {
  return [];
}
