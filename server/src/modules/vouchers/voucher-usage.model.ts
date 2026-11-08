import { Schema, model, type Types } from 'mongoose';

export interface VoucherUsageDoc {
  _id: Types.ObjectId;
  voucherId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Unique: mỗi đơn tối đa một voucher. */
  orderId: Types.ObjectId;
  status: 'USED' | 'USAGE_REFUNDED';
  usedAt: Date;
  usageRefundedAt?: Date;
}

const voucherUsageSchema = new Schema<VoucherUsageDoc>(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: 'vouchers', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'orders', required: true, unique: true },
    status: { type: String, required: true, enum: ['USED', 'USAGE_REFUNDED'], default: 'USED' },
    usedAt: { type: Date, required: true },
    usageRefundedAt: Date,
  },
  { timestamps: true },
);
voucherUsageSchema.index({ voucherId: 1, userId: 1 });

export const VoucherUsageModel = model<VoucherUsageDoc>('voucher_usages', voucherUsageSchema);
