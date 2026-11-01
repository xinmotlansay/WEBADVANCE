import { Schema, model, type Types } from 'mongoose';
import { ShipmentStatus } from '../../lib/shared-enums.js';
import type { DeliverySlot } from '../checkout/delivery.js';

export interface ShipmentDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  carrier?: string | null;
  trackingCode?: string | null;
  assignedTeam?: string | null;
  status: ShipmentStatus;
  /** Ngày giao dự kiến gốc (0h UTC của ngày theo giờ VN), không ghi đè khi hẹn lại (BR-D05). */
  estimatedDeliveryDate?: Date | null;
  scheduledDate?: Date | null;
  scheduledSlot?: DeliverySlot | null;
  rescheduleCount: number;
  redeliveryCount: number;
  failureReason?: string | null;
  actualShippingCost?: number | null;
  actualDeliveryDate?: Date | null;
  installationSchedule?: Date | null;
}

const shipmentSchema = new Schema<ShipmentDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'orders', required: true, unique: true },
    carrier: { type: String, default: null },
    trackingCode: { type: String, default: null },
    assignedTeam: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(ShipmentStatus),
      required: true,
      default: ShipmentStatus.PENDING,
    },
    estimatedDeliveryDate: { type: Date, default: null },
    scheduledDate: { type: Date, default: null },
    scheduledSlot: { type: String, enum: ['MORNING', 'AFTERNOON', null], default: null },
    rescheduleCount: { type: Number, default: 0 },
    redeliveryCount: { type: Number, default: 0 },
    failureReason: { type: String, default: null },
    actualShippingCost: { type: Number, default: null },
    actualDeliveryDate: { type: Date, default: null },
    installationSchedule: { type: Date, default: null },
  },
  { timestamps: true },
);

export const ShipmentModel = model<ShipmentDoc>('shipments', shipmentSchema);
