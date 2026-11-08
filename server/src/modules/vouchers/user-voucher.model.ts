import { Schema, model, type Types } from 'mongoose';

export interface UserVoucherDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  voucherId: Types.ObjectId;
  source: 'COLLECTED' | 'GIFTED' | 'LATE_COMPENSATION';
  sourceOrderId?: Types.ObjectId;
  receivedAt: Date;
  /** Hạn dùng riêng, ghi đè hạn của voucher (voucher bù: 30 ngày). */
  expiresAt?: Date;
  status: 'UNUSED' | 'USED' | 'EXPIRED';
  /** Đơn đã dùng voucher này, để hoàn lại ví khi đơn bị hủy. */
  usedOrderId?: Types.ObjectId;
  /** Lúc khách xem/đóng dải thông báo voucher tặng (báo cáo chiến dịch cột "Đã xem"). */
  seenAt?: Date;
}

const userVoucherSchema = new Schema<UserVoucherDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    voucherId: { type: Schema.Types.ObjectId, ref: 'vouchers', required: true },
    source: { type: String, required: true, enum: ['COLLECTED', 'GIFTED', 'LATE_COMPENSATION'] },
    sourceOrderId: { type: Schema.Types.ObjectId, ref: 'orders' },
    receivedAt: { type: Date, required: true },
    expiresAt: Date,
    status: {
      type: String,
      required: true,
      enum: ['UNUSED', 'USED', 'EXPIRED'],
      default: 'UNUSED',
    },
    usedOrderId: { type: Schema.Types.ObjectId, ref: 'orders' },
    seenAt: Date,
  },
  { timestamps: true },
);

export const UserVoucherModel = model<UserVoucherDoc>('user_vouchers', userVoucherSchema);
