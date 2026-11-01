import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

export const adminGuestGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/admin/dashboard']) : true;
};
