import { Schema, model, type Types } from 'mongoose';

export interface AuditLogDoc {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  performedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true, index: true },
    targetId: { type: String, default: null, index: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: null },
    performedAt: { type: Date, default: () => new Date(), index: true },
  },
  { collection: 'audit_logs' },
);

auditLogSchema.index({ performedAt: -1 });

export const AuditLogModel = model<AuditLogDoc>('AuditLog', auditLogSchema);
