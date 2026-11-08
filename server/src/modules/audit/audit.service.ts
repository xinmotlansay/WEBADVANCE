import type { Types } from 'mongoose';
import { logger } from '../../lib/logger.js';
import { AuditLogModel } from './audit-log.model.js';

export interface AuditInput {
  userId?: string | Types.ObjectId | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

/**
 * Ghi nhật ký hoạt động. Không chặn luồng nghiệp vụ nếu ghi log thất bại:
 * lỗi được log lại để không làm hỏng giao dịch chính.
 */
export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    await AuditLogModel.create({
      userId: input.userId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      ipAddress: input.ipAddress ?? null,
      performedAt: new Date(),
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Không ghi được nhật ký hoạt động');
  }
}
