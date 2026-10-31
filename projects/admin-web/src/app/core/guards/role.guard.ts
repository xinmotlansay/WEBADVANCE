import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../auth/admin-auth.service';
import { ToastService } from '../../shared/ui/toast';

/**
 * Chặn ở URL (admin-ui-rule mục 8): vào đường dẫn không thuộc quyền thì về dashboard của vai trò kèm
 * thông báo. Chỉ là lớp tiện dụng, kiểm tra quyền thật nằm ở backend.
 */
export function roleGuard(...roles: string[]): CanActivateFn {
  return () => {
    const role = inject(AdminAuthService).user()?.roleName ?? '';
    if (roles.includes(role)) return true;
    inject(ToastService).show('Bạn không có quyền truy cập trang này. Đã chuyển về trang chính của bạn.', 'error');
    return inject(Router).createUrlTree(['/']);
  };
}
