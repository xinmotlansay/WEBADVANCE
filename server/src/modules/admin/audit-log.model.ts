import { Schema, model, type Types } from 'mongoose';
import type { Request } from 'express';
import { getClientIp } from '../../middlewares/auth.middleware.js';

/** Nhật ký hoạt động Admin (NF-A04, Database Design 3.37). Chỉ ghi thêm, không sửa hay xóa. */
export interface AuditLogDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress: string;
  performedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  oldValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed,
  ipAddress: { type: String, required: true },
  performedAt: { type: Date, required: true, default: Date.now, index: -1 },
});

export const AuditLogModel = model<AuditLogDoc>('audit_logs', auditLogSchema);

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/** Ghi một dòng nhật ký cho admin đang đăng nhập (`requireAuth` đã gán `req.user`). */
export async function writeAudit(req: Request, entry: AuditEntry): Promise<void> {
  await AuditLogModel.create({ ...entry, userId: req.user!.id, ipAddress: getClientIp(req) });
}
