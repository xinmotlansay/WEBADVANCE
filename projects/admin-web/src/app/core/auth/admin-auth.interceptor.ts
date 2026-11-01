import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AdminAuthService } from './admin-auth.service';

export const adminAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const outgoing = request.clone({
    withCredentials: true,
    ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
  });

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      const isAuthEndpoint = /\/auth\/(login|refresh|logout)(?:\?|$)/.test(request.url);
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      return auth.refreshOnce().pipe(
        switchMap((newToken) =>
          next(
            request.clone({
              withCredentials: true,
              setHeaders: { Authorization: `Bearer ${newToken}` },
            }),
          ),
        ),
        catchError((refreshError: unknown) => {
          auth.clearSession();
          void router.navigate(['/admin/login'], { queryParams: { expired: '1' } });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
