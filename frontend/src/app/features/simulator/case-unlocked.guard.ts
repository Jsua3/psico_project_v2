import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, forkJoin, map, of, timeout } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';

/** Ni el catálogo ni el historial pueden dejar a nadie esperando a la puerta: pasado esto, decide el servidor. */
export const CASE_UNLOCK_CHECK_MS = 3000;

/**
 * Abrir por dirección un caso bloqueado (plan visual F5-5): el estudiante vuelve al catálogo con `?bloqueado=<id>` y
 * el catálogo dice cuál y por qué. Solo informa: el desbloqueo lineal lo debe exigir el servidor (SIEP-RF-12,
 * estructural), así que si el catálogo falla, tarda o no conoce el caso, deja pasar y decide el servidor. Un intento
 * abierto en ese caso se puede continuar aunque haya quedado bloqueado (RN-07: continuar, pausar o terminar).
 * Docencia y administración ven todo abierto: no se mira.
 */
export const caseUnlockedGuard: CanActivateFn = route => {
  if (!inject(AuthService).hasRole('ESTUDIANTE')) return true;
  const router = inject(Router);
  const simulation = inject(SimulationService);
  const caseVersionId = Number(route.paramMap.get('caseVersionId'));
  return forkJoin({
    catalog: simulation.getCatalog().pipe(timeout(CASE_UNLOCK_CHECK_MS), catchError(() => of(null as CatalogItem[] | null))),
    history: simulation.attemptHistory().pipe(timeout(CASE_UNLOCK_CHECK_MS), catchError(() => of([] as StudentAttemptSummary[]))),
  }).pipe(map(({ catalog, history }) => {
    const item = catalog?.find(entry => entry.caseVersionId === caseVersionId);
    if (!item || item.unlocked) return true;
    const open = history.some(attempt => attempt.caseVersionId === caseVersionId
      && (attempt.status === 'IN_PROGRESS' || attempt.status === 'PAUSED'));
    return open || router.createUrlTree(['/portal/simulador'], { queryParams: { bloqueado: caseVersionId } });
  }));
};
