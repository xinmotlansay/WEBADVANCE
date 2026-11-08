import { AppError } from '../../utils/app-error.js';

export type AdminChange = 'DEACTIVATE' | 'CHANGE_ROLE';

export interface AdminChangeContext {
  actorId: string;
  targetId: string;
  /** Tài khoản bị tác động đang là Admin cấp cao còn hoạt động. */
  targetIsActiveSuperAdmin: boolean;
  /** Đổi vai trò: vai trò mới vẫn là Admin cấp cao thì không làm giảm số Admin cấp cao. */
  keepsSuperAdmin?: boolean;
  activeSuperAdminCount: number;
}

/**
 * AD-12, AD-13: không tự khóa hay tự đổi vai trò của chính mình, và luôn còn ít nhất một Admin cấp cao
 * hoạt động. Ném `AppError` khi vi phạm.
 */
export function assertAdminChangeAllowed(change: AdminChange, ctx: AdminChangeContext): void {
  if (ctx.actorId === ctx.targetId) {
    throw new AppError(
      'SELF_ACTION_FORBIDDEN',
      409,
      change === 'DEACTIVATE'
        ? 'Bạn không thể vô hiệu hóa tài khoản của chính mình'
        : 'Bạn không thể đổi vai trò của chính mình',
    );
  }
  const removesSuperAdmin = ctx.targetIsActiveSuperAdmin && !(change === 'CHANGE_ROLE' && ctx.keepsSuperAdmin);
  if (removesSuperAdmin && ctx.activeSuperAdminCount <= 1) {
    throw new AppError('LAST_SUPER_ADMIN', 409, 'Phải còn ít nhất một Admin cấp cao đang hoạt động');
  }
}

/** Mật khẩu Admin tối thiểu 12 ký tự (AD-01, NF-A02). */
export const ADMIN_MIN_PASSWORD_LENGTH = 12;
/** Liên kết đặt mật khẩu cho Admin mới có hạn 48 giờ (AD-11: 24–48 giờ). */
export const ADMIN_INVITE_TTL_HOURS = 48;
