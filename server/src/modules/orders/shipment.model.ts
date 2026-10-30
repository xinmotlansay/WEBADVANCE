import { Schema, model, type Types } from 'mongoose';
import type { DeliverySlot } from '../checkout/delivery.js';

export interface ShipmentDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  carrier?: string;
  trackingCode?: string;
  assignedTeam?: string;
  status: string;
  /** Ngày giao dự kiến gốc (0h UTC của ngày theo giờ VN), không ghi đè khi hẹn lại (BR-D05). */
  estimatedDeliveryDate: Date;
  scheduledDate?: Date | null;
  scheduledSlot?: DeliverySlot | null;
  rescheduleCount: number;
  redeliveryCount: number;
  failureReason?: string;
  actualShippingCost?: number;
  actualDeliveryDate?: Date;
  installationSchedule?: Date | null;
}

const shipmentSchema = new Schema<ShipmentDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'orders', required: true, unique: true },
    carrier: String,
    trackingCode: String,
    assignedTeam: String,
    // ponytail: Database Design chưa có enum trạng thái vận chuyển; thêm khi làm luồng giao hàng.
    status: { type: String, required: true, default: 'PENDING' },
    estimatedDeliveryDate: { type: Date, required: true },
    scheduledDate: { type: Date, default: null },
    scheduledSlot: { type: String, enum: ['MORNING', 'AFTERNOON', null], default: null },
    rescheduleCount: { type: Number, default: 0 },
    redeliveryCount: { type: Number, default: 0 },
    failureReason: String,
    actualShippingCost: Number,
    actualDeliveryDate: Date,
    installationSchedule: { type: Date, default: null },
  },
  { timestamps: true },
);

export const ShipmentModel = model<ShipmentDoc>('shipments', shipmentSchema);
