import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, Signal } from '@angular/core';

import type { AuditListEnvelope } from './generated/openapi-contracts';

export type { AuditList, AuditListEnvelope, AuditLogItem, ReviewQuality } from './generated/openapi-contracts';

/**
 * Filtros de `GET /api/admin/audit`, con los nombres que el servidor entiende (el documento OpenAPI los declara:
 * `actorId`, `action`, `resourceType`, `from`, `to`, `page`, `pageSize`).
 */
export interface AuditFilterParams {
  readonly actorId?: number;
  /** Código `entidad.verbo` (o el legado) de la acción. */
  readonly action?: string;
  readonly resourceType?: string;
  /** ISO 8601. Con zona el servidor la convierte a su hora local (America/Bogota); sin zona ya lo es. */
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Piloto de `httpResource()` (E5-8 · ANG-4) para la consulta administrativa de auditoría (E5-7 · C15).
 * Cancela peticiones obsoletas con `AbortSignal` cuando cambian los filtros reactivos. Los tipos de la respuesta
 * salen del esquema OpenAPI (`generated/openapi-contracts.d.ts`): si el servidor cambia la forma, esto deja de
 * compilar al regenerarlos.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  createAuditResource(filters: Signal<AuditFilterParams>): HttpResourceRef<AuditListEnvelope | undefined> {
    return httpResource<AuditListEnvelope>(() => {
      const current = filters();
      const params: Record<string, string | number> = {};
      if (current.actorId !== undefined) params['actorId'] = current.actorId;
      if (current.action) params['action'] = current.action;
      if (current.resourceType) params['resourceType'] = current.resourceType;
      if (current.from) params['from'] = current.from;
      if (current.to) params['to'] = current.to;
      if (current.page !== undefined) params['page'] = current.page;
      if (current.pageSize !== undefined) params['pageSize'] = current.pageSize;
      return {
        url: '/api/admin/audit',
        method: 'GET',
        params,
      };
    });
  }
}
