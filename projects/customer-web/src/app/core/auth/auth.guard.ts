import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { map } from 'rxjs';
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService),
    router = inject(Router);
  return auth.user()
    ? true
    : auth
        .restore()
        .pipe(
          map(
            (ok) =>
              ok || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
          ),
        );
};
