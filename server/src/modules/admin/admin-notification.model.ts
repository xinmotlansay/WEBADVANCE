import { Schema, model, type Types } from 'mongoose';
import { RoleName } from '../../lib/shared-enums.js';

export type AdminNotificationType = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'REVIEW_REPORTED' | 'STOCK_DIGEST';

/**
 * Thông báo trong ứng dụng, chỉ dành cho Admin (requirements 1.1). Mỗi thông báo gửi cho các vai trò
 * trong `roleNames`; `dedupeKey` chặn gửi trùng (ví dụ một biến thể chỉ báo sắp hết một lần mỗi ngày).
 */
export interface AdminNotificationDoc {
  _id: Types.ObjectId;
  type: AdminNotificationType;
  roleNames: RoleName[];
  title: string;
  detail: string;
  link: string;
  targetId?: string;
  dedupeKey?: string;
  readBy: Types.ObjectId[];
  createdAt: Date;
}

const adminNotificationSchema = new Schema<AdminNotificationDoc>(
  {
    type: {
      type: String,
      required: true,
      enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'REVIEW_REPORTED', 'STOCK_DIGEST'],
    },
    roleNames: { type: [String], enum: Object.values(RoleName), required: true, index: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    link: { type: String, default: '' },
    targetId: String,
    dedupeKey: { type: String, unique: true, sparse: true },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminNotificationSchema.index({ createdAt: -1 });

export const AdminNotificationModel = model<AdminNotificationDoc>('admin_notifications', adminNotificationSchema);

/** Tạo thông báo; trùng `dedupeKey` thì bỏ qua. */
export async function pushNotification(
  entry: Omit<AdminNotificationDoc, '_id' | 'readBy' | 'createdAt'>,
): Promise<void> {
  try {
    await AdminNotificationModel.create(entry);
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}
