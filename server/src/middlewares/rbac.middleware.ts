import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';
import type { RoleName } from '../lib/shared-enums.js';

/**
 * Chặn endpoint theo vai trò. Phải đặt sau `requireAuth`.
 */
export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 401, 'Bạn chưa đăng nhập');
    }

    if (!roles.includes(req.user.roleName)) {
      throw new AppError('FORBIDDEN', 403, 'Bạn không có quyền truy cập chức năng này');
    }

    next();
  };
}
