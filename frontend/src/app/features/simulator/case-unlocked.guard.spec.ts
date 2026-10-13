import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { caseUnlockedGuard } from './case-unlocked.guard';

function item(caseVersionId: number, order: number, unlocked: boolean): CatalogItem {
  return { caseVersionId, code: `C${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order, unlocked, completed: false, locked: !unlocked };
}

/**
 * Abrir por dirección un caso bloqueado (plan visual F5-5): el estudiante vuelve al catálogo con el motivo. Solo
 * informa: el servidor sigue siendo quien decide (SIEP-RF-12 es estructural), así que si el catálogo falla deja pasar.
 */
// req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H
describe('caseUnlockedGuard', () => {
  let getCatalog: ReturnType<typeof vi.fn>;

  function setup(role: string, catalog: () => Observable<CatalogItem[]>) {
    getCatalog = vi.fn(catalog);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: { getCatalog } },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
      ],
    });
  }

  async function run(caseVersionId: string): Promise<boolean | UrlTree> {
    const route = { paramMap: convertToParamMap({ caseVersionId }) } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => caseUnlockedGuard(route, {} as RouterStateSnapshot));
    return isObservable(result) ? firstValueFrom(result as Observable<boolean | UrlTree>) : (result as boolean | UrlTree);
  }

  it('estudiante y caso bloqueado: vuelve al catálogo con ?bloqueado=<id>', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]));
    const result = await run('2');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/portal/simulador?bloqueado=2');
  });

  it('estudiante y caso abierto: pasa', async () => {
    setup('ESTUDIANTE', () => of([item(1, 1, true), item(2, 2, false)]));
    expect(await run('1')).toBe(true);
  });

  it('si el catálogo falla o el caso no está en él, pasa (decide el servidor)', async () => {
    setup('ESTUDIANTE', () => throwError(() => ({ status: 500 })));
    expect(await run('2')).toBe(true);
    TestBed.resetTestingModule();
    setup('ESTUDIANTE', () => of([item(1, 1, true)]));
    expect(await run('7')).toBe(true);
  });

  it('docencia y administración no se miran (ven todo abierto) y no piden el catálogo', async () => {
    setup('ADMIN', () => of([item(2, 2, false)]));
    expect(await run('2')).toBe(true);
    expect(getCatalog).not.toHaveBeenCalled();
  });
});
