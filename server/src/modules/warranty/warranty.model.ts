import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { WarrantyInspectionResult, WarrantyResolution, WarrantyStatus } from '../../lib/shared-enums.js';

export interface WarrantyCardDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  userId: Types.ObjectId;
  productName?: string | null;
  sku?: string | null;
  startsAt: Date;
  expiresAt: Date;
  warrantyMonths: number;
}

const warrantyCardSchema = new Schema<WarrantyCardDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productName: { type: String, default: null },
    sku: { type: String, default: null },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    warrantyMonths: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: 'warranty_cards' },
);
warrantyCardSchema.index({ orderId: 1, orderItemId: 1 }, { unique: true });

export type WarrantyCardDocument = HydratedDocument<WarrantyCardDoc>;
export const WarrantyCardModel = model<WarrantyCardDoc>('WarrantyCard', warrantyCardSchema);

export interface WarrantyRequestDoc {
  _id: Types.ObjectId;
  code: string;
  warrantyCardId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  userId: Types.ObjectId;
  defectDescription: string;
  condition: string;
  evidence: string[];
  status: WarrantyStatus;
  rejectReason?: string | null;
  inspectionResult?: WarrantyInspectionResult | null;
  resolution?: WarrantyResolution | null;
  homeServiceSchedule?: Date | null;
  customerShipment: { carrier?: string | null; trackingCode?: string | null };
  returnShipment: { carrier?: string | null; trackingCode?: string | null };
  history: Array<{ at: Date; status: WarrantyStatus; note?: string | null }>;
  requestedAt: Date;
  approvedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const warrantyHistorySchema = new Schema(
  {
    at: { type: Date, required: true },
    status: { type: String, enum: Object.values(WarrantyStatus), required: true },
    note: { type: String, default: null },
  },
  { _id: false },
);

const warrantyRequestSchema = new Schema<WarrantyRequestDoc>(
  {
    code: { type: String, required: true, unique: true },
    warrantyCardId: { type: Schema.Types.ObjectId, ref: 'WarrantyCard', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    defectDescription: { type: String, required: true },
    // Yêu cầu do khách gửi chỉ có loại lỗi và mô tả, không có trường này.
    condition: { type: String, default: '' },
    evidence: { type: [String], default: [] },
    status: {
      type: String,
      enum: Object.values(WarrantyStatus),
      default: WarrantyStatus.PENDING_CONFIRMATION,
      index: true,
    },
    rejectReason: { type: String, default: null },
    inspectionResult: { type: String, enum: Object.values(WarrantyInspectionResult), default: null },
    resolution: { type: String, enum: Object.values(WarrantyResolution), default: null },
    homeServiceSchedule: { type: Date, default: null },
    customerShipment: {
      carrier: { type: String, default: null },
      trackingCode: { type: String, default: null },
    },
    returnShipment: {
      carrier: { type: String, default: null },
      trackingCode: { type: String, default: null },
    },
    history: { type: [warrantyHistorySchema], default: [] },
    requestedAt: { type: Date, required: true, index: true },
    approvedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'warranty_requests' },
);
warrantyRequestSchema.index({ status: 1, requestedAt: -1 });

export type WarrantyRequestDocument = HydratedDocument<WarrantyRequestDoc>;
export const WarrantyRequestModel = model<WarrantyRequestDoc>('WarrantyRequest', warrantyRequestSchema);
