import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { NotificationService } from '../notifications/notification.service';
import { buildHttpErrorChain } from './http-error-chain';

const errorChain = buildHttpErrorChain();

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);
  const token = auth.getToken();
  const isLoginRequest = req.url.includes('/api/auth/login');

  if (token && !isLoginRequest && !auth.isTokenExpired(token)) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      errorChain.handle({ error, url: req.url, auth, router, notifications });
      return throwError(() => error);
    })
  );
};
