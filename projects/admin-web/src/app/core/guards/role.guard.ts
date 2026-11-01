import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { RoleName } from 'shared';
import { AdminAuthService } from '../auth/admin-auth.service';

/**
 * Chặn đường dẫn không thuộc quyền (admin-ui-rule mục 8): về dashboard của vai trò kèm thông báo.
 * Đây chỉ là lớp tiện dụng, quyền thật kiểm ở backend.
 */
export function roleGuard(...roles: RoleName[]): CanActivateFn {
  return () => {
    const role = inject(AdminAuthService).user()?.roleName;
    if (role && roles.includes(role)) return true;
    return inject(Router).createUrlTree(['/'], { queryParams: { khongCoQuyen: 1 } });
  };
}
