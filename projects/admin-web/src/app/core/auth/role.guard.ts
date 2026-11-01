import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { RoleName } from 'shared';
import { navForRole } from '../nav/admin-menu';
import { NotificationService } from '../ui/notification.service';
import { AdminAuthService } from './admin-auth.service';

/** Chặn cả ở URL: vào route không thuộc quyền thì đưa về dashboard kèm thông báo. */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  const allowed = (route.data['roles'] as RoleName[] | undefined) ?? [];
  const role = auth.role();

  if (!role) {
    return router.createUrlTree(['/admin/login']);
  }
  if (allowed.length === 0 || allowed.includes(role)) {
    return true;
  }

  notifications.show('Bạn không có quyền truy cập chức năng này.', 'error');
  const fallbackRoute = navForRole(role)[0]?.route ?? '/admin/access-denied';
  return router.createUrlTree([fallbackRoute]);
};
