import { APP_INITIALIZER, ApplicationConfig, inject } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { AuthService } from './core/auth/auth.service';
import { SiepTitleStrategy } from './core/title/siep-title.strategy';

function initializeAuth() {
  const auth = inject(AuthService);
  return () => firstValueFrom(auth.syncCurrentUser());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAnimationsAsync(),
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true }
  ]
};
