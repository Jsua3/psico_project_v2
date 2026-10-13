import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Abrir por dirección un caso bloqueado (plan visual F5-5): el estudiante vuelve al catálogo con `?bloqueado=<id>` y
 * el catálogo dice cuál y por qué. Solo informa: el desbloqueo lineal lo debe exigir el servidor (SIEP-RF-12,
 * estructural), así que si el catálogo falla o no conoce el caso, deja pasar y decide el servidor. Docencia y
 * administración ven todo abierto: no se mira.
 */
export const caseUnlockedGuard: CanActivateFn = route => {
  if (!inject(AuthService).hasRole('ESTUDIANTE')) return true;
  const router = inject(Router);
  const caseVersionId = Number(route.paramMap.get('caseVersionId'));
  return inject(SimulationService).getCatalog().pipe(
    map(catalog => {
      const item = catalog.find(entry => entry.caseVersionId === caseVersionId);
      if (!item || item.unlocked) return true;
      return router.createUrlTree(['/portal/simulador'], { queryParams: { bloqueado: caseVersionId } });
    }),
    catchError(() => of(true)),
  );
};
