import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AdminAuthService } from '../auth/admin-auth.service';

const PUBLIC_AUTH_PATHS = ['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/logout'];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AdminAuthService);
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
        switchMap((newToken) =>
          next(request.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })),
        ),
        catchError((refreshError: unknown) => {
          const returnUrl = router.url;
          auth.clearSession();
          void router.navigate(['/admin/login'], {
            queryParams: { expired: '1', returnUrl },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
