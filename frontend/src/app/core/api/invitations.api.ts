import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { ApiResponse } from './api-response';
import { CaseListCache } from './case-list-cache';
import { MembershipStatus } from './grupo.service';

/** C5 (E2-10): una invitación a un grupo; `id` es el del grupo (la membresía es grupo + estudiante). */
export interface Invitation {
  id: number;
  groupId: number;
  groupName: string;
  teacherName: string;
  invitedAt: string | null;
  status: MembershipStatus;
}

/**
 * Bandeja de invitaciones del estudiante (C5 de E2-10; decisión 22: un docente no suma a nadie sin su aceptación).
 * Las órdenes mandan `{}`: el servidor solo acepta cuerpos JSON que sean un objeto.
 */
@Injectable({ providedIn: 'root' })
export class InvitationsApi {
  private readonly http = inject(HttpClient);
  private readonly caseList = inject(CaseListCache);
  private readonly API = '/api/me/invitations';

  list() {
    return this.http.get<ApiResponse<Invitation[]>>(this.API).pipe(map(response => response.data));
  }

  // Cada orden con su ruta literal: `api-routes.contract.spec` la compara con las rutas de Django.
  accept(groupId: number) {
    return this.respond(this.http.post<ApiResponse<Invitation>>(`${this.API}/${groupId}/accept`, {}));
  }

  decline(groupId: number) {
    return this.respond(this.http.post<ApiResponse<Invitation>>(`${this.API}/${groupId}/decline`, {}));
  }

  /** Dejar un grupo del que ya es miembro (`ACTIVE → REMOVED`; el docente puede volver a invitarlo). */
  leave(groupId: number) {
    return this.respond(this.http.post<ApiResponse<Invitation>>(`${this.API}/${groupId}/leave`, {}));
  }

  /**
   * Responder (o dejar un grupo) cambia los casos que ve el estudiante: la lista guardada por 30 s del panel y del
   * catálogo no puede servir la de antes (aceptar y abrir «Simulador» enseguida decía «sin casos asignados»).
   */
  private respond(request: Observable<ApiResponse<Invitation>>): Observable<Invitation> {
    return request.pipe(
      tap(() => this.caseList.invalidate()),
      map(response => response.data),
    );
  }
}
