import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, Signal } from '@angular/core';

import { ApiResponse } from './api-response';

export interface AuditLogItem {
  readonly id: number;
  readonly action: string;
  readonly taxonomy: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly actorUserId: number | null;
  readonly actorEmail: string | null;
  readonly actorRole: string | null;
  readonly ipAddress: string | null;
  readonly context: Record<string, unknown>;
  readonly createdAt: string | null;
}

export interface AuditListResponse {
  readonly items: AuditLogItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly coverage: { shown: number; total: number };
  readonly retentionDays: number;
  readonly reviewQuality: {
    readonly contentCommentCount: number;
    readonly formOnlyCount: number;
    readonly totalReviews: number;
    readonly formRatio: number;
    readonly rubberStampWarning: boolean;
  };
}

export interface AuditFilterParams {
  readonly actor?: string;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Piloto de `httpResource()` (E5-8 · ANG-4) para la consulta administrativa de auditoría (E5-7 · C15).
 * Cancela peticiones obsoletas con `AbortSignal` cuando cambian los filtros reactivos.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  createAuditResource(filters: Signal<AuditFilterParams>): HttpResourceRef<ApiResponse<AuditListResponse> | undefined> {
    return httpResource<ApiResponse<AuditListResponse>>(() => {
      const current = filters();
      const params: Record<string, string | number> = {};
      if (current.actor) params['actor'] = current.actor;
      if (current.action) params['action'] = current.action;
      if (current.entityType) params['entityType'] = current.entityType;
      if (current.entityId) params['entityId'] = current.entityId;
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
