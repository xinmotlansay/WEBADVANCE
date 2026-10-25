import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/v1/')) return next(request);
  const auth = inject(AuthService);
  const authenticated = auth.token()
    ? request.clone({ setHeaders: { Authorization: `Bearer ${auth.token()}` } })
    : request;
  return next(authenticated).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        request.url.includes('/auth/')
      )
        return throwError(() => error);
      return auth
        .restore()
        .pipe(
          switchMap((ok) =>
            ok
              ? next(request.clone({ setHeaders: { Authorization: `Bearer ${auth.token()}` } }))
              : throwError(() => error),
          ),
        );
    }),
  );
};
