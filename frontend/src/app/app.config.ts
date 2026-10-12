import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { MAT_CARD_CONFIG } from '@angular/material/card';
import { MatIconRegistry } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { CachedSimulationService } from './core/api/cached-simulation.service';
import { SimulationService } from './core/api/simulation.service';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { AuthService } from './core/auth/auth.service';
import { settleWithin } from './core/auth/settle-within.util';
import { User } from './core/models/user.model';
import { SiepTitleStrategy } from './core/title/siep-title.strategy';

/**
 * Lo máximo que el arranque espera a `/api/auth/me`. El usuario ya sale del JWT
 * (los guards solo miran el token): `/me` completa nombre y apellido y, si falla
 * con 401/403, el interceptor limpia la sesión y lleva al login aunque ya se haya pintado.
 */
const AUTH_SYNC_BUDGET_MS = 1500;

/** Valida la sesión contra `/me` sin retener el primer pintado más de AUTH_SYNC_BUDGET_MS. */
export function initializeAuthSession(): Promise<User | null | undefined> {
  const auth = inject(AuthService);
  return settleWithin(firstValueFrom(auth.syncCurrentUser()), AUTH_SYNC_BUDGET_MS);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
    provideHttpClient(withXhr(), withInterceptors([jwtInterceptor])),
    // Proxy de caché: los componentes siguen inyectando SimulationService (ver CachedSimulationService).
    { provide: SimulationService, useExisting: CachedSimulationService },
    provideAppInitializer(initializeAuthSession),
    // Material Symbols (subconjunto autoalojado) como fuente de los <mat-icon>, sin `font-family !important` (F1-3).
    provideAppInitializer(() => { inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded'); }),
    // Tarjetas con borde fino por token y elevación suave (F1-4): la apariencia «elevated» fija border-width 0.
    { provide: MAT_CARD_CONFIG, useValue: { appearance: 'outlined' } },
  ]
};
