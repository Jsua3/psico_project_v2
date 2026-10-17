import { CaseAccess } from '../../core/models/simulation.model';
import { formatDate } from '../dashboard/student-dashboard.util';

export interface AccessNotice {
  readonly tone: 'info' | 'warning';
  /** Icono del subconjunto de la fuente (`scripts/ui/material-symbols-rounded.icons.json`): uno nuevo exige regenerarla. */
  readonly icon: 'schedule' | 'lock' | 'block' | 'info';
  readonly title: string;
  readonly detail: string;
}

/**
 * Qué se le dice al estudiante cuando el servidor no lo deja iniciar un caso (F10-1; RN-04, RF-15, decisión 12). La
 * decisión es del servidor (`access` de la ficha y del catálogo): aquí solo se pone en palabras, con la fecha que
 * explica la ventana. Un motivo que el cliente no conoce no se enseña como código: se dice «no disponible».
 */
export function accessNotice(access: CaseAccess): AccessNotice | null {
  if (access.allowed) return null;
  switch (access.reason) {
    case 'NOT_ASSIGNED':
      return {
        tone: 'warning',
        icon: 'lock',
        title: 'Este caso no está asignado a tu cuenta',
        detail: 'Tu docente lo asigna a tu grupo; cuando lo haga aparecerá en tu catálogo.',
      };
    case 'NOT_YET_OPEN':
      return {
        tone: 'info',
        icon: 'schedule',
        title: 'Aún no abre',
        detail: access.opensAt ? `Desde el ${formatDate(access.opensAt, true)} podrás comenzarlo.` : 'Tu docente aún no define cuándo se abre.',
      };
    case 'CLOSED':
      return {
        tone: 'warning',
        icon: 'block',
        title: 'Ya cerró',
        detail: `${access.closesAt ? `El plazo terminó el ${formatDate(access.closesAt, true)}` : 'El plazo de este caso terminó'}; `
          + 'ya no se pueden iniciar intentos, pero uno en curso se puede terminar.',
      };
    case 'LOCKED_BY_SEQUENCE':
      return {
        tone: 'info',
        icon: 'lock',
        title: 'Bloqueado por la secuencia',
        detail: 'Completa antes el caso anterior para abrirlo.',
      };
    default:
      return {
        tone: 'info',
        icon: 'info',
        title: 'Este caso no está disponible ahora',
        detail: 'Vuelve al catálogo y revisa si tu docente ya lo asignó o si está abierto.',
      };
  }
}
