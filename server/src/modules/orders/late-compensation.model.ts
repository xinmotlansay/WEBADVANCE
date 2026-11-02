import { Schema, model, type Types } from 'mongoose';
import { LateCompensationStatus } from '../../lib/shared-enums.js';

export interface LateCompensationRequestDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  daysLate: number;
  estimatedDeliveryDate: Date;
  actualDeliveryDate?: Date | null;
  voucherValue: number;
  status: LateCompensationStatus;
  requestedAt: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  reviewNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const lateCompensationSchema = new Schema<LateCompensationRequestDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    daysLate: { type: Number, required: true, min: 0 },
    estimatedDeliveryDate: { type: Date, required: true },
    actualDeliveryDate: { type: Date, default: null },
    voucherValue: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(LateCompensationStatus),
      default: LateCompensationStatus.PENDING,
      index: true,
    },
    requestedAt: { type: Date, required: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, default: null },
  },
  { timestamps: true, collection: 'late_compensation_requests' },
);

lateCompensationSchema.index({ orderId: 1, status: 1 });

export const LateCompensationRequestModel = model<LateCompensationRequestDoc>(
  'LateCompensationRequest',
  lateCompensationSchema,
);
