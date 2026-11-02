import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../auth/admin-auth.service';

/** Chưa đăng nhập thì về trang đăng nhập, nhớ trang đang vào để quay lại sau (mục 9, admin-ui-rule). */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

/** Đã đăng nhập thì không vào lại trang đăng nhập. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
