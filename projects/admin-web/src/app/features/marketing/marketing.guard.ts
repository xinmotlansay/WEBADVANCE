import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleName } from 'shared';
import { AdminAuthService } from '../../services/auth/admin-auth.service';

/** Chỉ Marketing Admin và Admin cấp cao vào được `/marketing/*`; vai trò khác về dashboard. */
export const marketingGuard: CanActivateFn = () => {
  const role = inject(AdminAuthService).user()?.roleName;
  const ok = role === RoleName.MARKETING_ADMIN || role === RoleName.SUPER_ADMIN;
  return ok ? true : inject(Router).createUrlTree(['/']);
};
