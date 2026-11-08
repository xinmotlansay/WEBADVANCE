import { logger } from '../../lib/logger.js';

/**
 * Nhật ký thao tác MKT_AD. Hiện ghi vào log ứng dụng; khi `audit-log` của nhánh ad-super-admin
 * được merge thì đổi thân hàm này, nơi gọi giữ nguyên. `flagged` = gắn cờ cho Super Admin.
 */
export function logAdminAction(
  actorId: string,
  action: string,
  target: string,
  meta: Record<string, unknown> = {},
  flagged = false,
): void {
  logger.info({ audit: true, actorId, action, target, flagged, ...meta }, 'marketing-admin');
}
