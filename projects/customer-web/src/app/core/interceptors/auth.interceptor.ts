import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/otp/', '/auth/refresh', '/auth/forgot-password', '/auth/google'];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.accessToken();
  const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) => request.url.includes(path));

  const authorizedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isPublicAuthRequest) {
        return throwError(() => error);
      }

      return auth.refreshOnce().pipe(
        switchMap(() =>
          next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${auth.accessToken() ?? ''}` },
            }),
          ),
        ),
        catchError((refreshError: unknown) => {
          auth.clearSession();
          void router.navigate(['/auth/login'], {
            queryParams: { returnUrl: router.url },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
