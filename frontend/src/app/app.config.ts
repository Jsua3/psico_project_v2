import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withNavigationErrorHandler, withPreloading, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MAT_CARD_CONFIG } from '@angular/material/card';
import { MatIconRegistry } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { CachedSimulationService } from './core/api/cached-simulation.service';
import { SimulationService } from './core/api/simulation.service';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { NotificationService } from './core/notifications/notification.service';
import { watchConnectionRecovery } from './core/notifications/connection-recovery';
import { SiepErrorHandler } from './core/error/siep-error-handler';
import { offlineNavigationHandler } from './core/navigation/offline-navigation';
import { PreloadMarkedRoutes } from './core/navigation/preload-marked';
import { filtrarTransiciones } from './core/navigation/transiciones';
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
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useExisting: SiepErrorHandler },
    // Sin red, una navegación que no pudo descargar su código lleva a «Sin conexión», precargada con red (F4-3).
    // Transiciones de vistas (DISENO §4.4, DP-10): solo los cambios de lugar (portal → juego y vuelta, editor ↔ ensayo)
    // corren; `filtrarTransiciones` salta el resto. Sin soporte del navegador, la navegación es la de siempre.
    provideRouter(routes, withNavigationErrorHandler(offlineNavigationHandler), withPreloading(PreloadMarkedRoutes), withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: info => filtrarTransiciones(info) })),
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
    // Proxy de caché: los componentes siguen inyectando SimulationService (ver CachedSimulationService).
    { provide: SimulationService, useExisting: CachedSimulationService },
    provideAppInitializer(initializeAuthSession),
    // El aviso de conexión se retira solo al volver la red (evento `online`) o con la primera respuesta correcta.
    provideAppInitializer(() => { watchConnectionRecovery(inject(NotificationService)); }),
    // Material Symbols (subconjunto autoalojado) como fuente de los <mat-icon>, sin `font-family !important` (F1-3).
    provideAppInitializer(() => { inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded'); }),
    // Tarjetas con borde fino por token y elevación suave (F1-4): la apariencia «elevated» fija border-width 0.
    { provide: MAT_CARD_CONFIG, useValue: { appearance: 'outlined' } },
  ]
};
