import { Schema, model, type Types } from 'mongoose';

/** Database Design thực thể 32: chỉ ghi thêm, không sửa, không xóa (NF-A04). */
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

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    ipAddress: { type: String, required: true },
    performedAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

auditLogSchema.index({ performedAt: -1 });
auditLogSchema.index({ userId: 1, performedAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, performedAt: -1 });

// Chặn sửa/xóa ở tầng model để không ai vô tình gọi updateOne/deleteOne lên nhật ký.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  auditLogSchema.pre(op, function () {
    throw new Error('audit_logs chỉ được ghi thêm');
  });
}

export const AuditLogModel = model<AuditLogDoc>('audit_logs', auditLogSchema);
