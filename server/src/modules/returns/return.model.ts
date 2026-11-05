import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { InspectionResult } from '../../lib/shared-enums.js';

export interface ReturnRequestDoc {
  _id: Types.ObjectId;
  code: string;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'EXCHANGE' | 'RETURN';
  quantity: number;
  reason: string;
  description?: string | null;
  evidence: string[];
  status: string;
  rejectReason?: string | null;
  inspectionResult?: InspectionResult | null;
  resolution?: string | null;
  costBearer?: 'CARAVESO' | 'CUSTOMER' | null;
  returnShippingFee: number;
  disassemblyFee: number;
  originalShippingRefund: number;
  refundAmount?: number | null;
  pickupSchedule?: Date | null;
  customerShipment: { carrier?: string | null; trackingCode?: string | null };
  returnShipment: { carrier?: string | null; trackingCode?: string | null };
  /** Đơn hàng mới tạo khi hoàn tất đổi hàng (giao sản phẩm thay thế). */
  exchangeOrderId?: Types.ObjectId | null;
  replacement: {
    variantId?: Types.ObjectId | null;
    quantity?: number | null;
    unitPrice?: number | null;
    productName?: string | null;
    sku?: string | null;
    trackingCode?: string | null;
    deliveredAt?: Date | null;
  };
  refund: {
    proofImage?: string | null;
    transactionAt?: Date | null;
    completed: boolean;
  };
  /** Thông tin liên hệ và tài khoản nhận hoàn tiền do khách nhập khi gửi yêu cầu. */
  contact?: { name?: string; phone?: string; email?: string; address?: string } | null;
  refundAccount?: { bankName?: string; accountNumber?: string; accountHolder?: string } | null;
  history: { at: Date; status: string; note?: string | null }[];
  requestedAt: Date;
  approvedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const returnRequestSchema = new Schema<ReturnRequestDoc>(
  {
    code: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['EXCHANGE', 'RETURN'], required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    description: { type: String, default: null },
    evidence: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'AWAITING_GOODS', 'PROCESSING', 'AWAITING_REFUND', 'REFUNDING', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    rejectReason: { type: String, default: null },
    inspectionResult: { type: String, enum: Object.values(InspectionResult), default: null },
    resolution: { type: String, default: null },
    costBearer: { type: String, enum: ['CARAVESO', 'CUSTOMER'], default: null },
    returnShippingFee: { type: Number, default: 0, min: 0 },
    disassemblyFee: { type: Number, default: 0, min: 0 },
    originalShippingRefund: { type: Number, default: 0, min: 0 },
    refundAmount: { type: Number, default: null, min: 0 },
    pickupSchedule: { type: Date, default: null },
    customerShipment: {
      carrier: { type: String, default: null },
      trackingCode: { type: String, default: null },
    },
    returnShipment: {
      carrier: { type: String, default: null },
      trackingCode: { type: String, default: null },
    },
    exchangeOrderId: { type: Schema.Types.ObjectId, ref: 'orders', default: null },
    replacement: {
      variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
      quantity: { type: Number, default: null, min: 1 },
      unitPrice: { type: Number, default: null, min: 0 },
      productName: { type: String, default: null },
      sku: { type: String, default: null },
      trackingCode: { type: String, default: null },
      deliveredAt: { type: Date, default: null },
    },
    refund: {
      proofImage: { type: String, default: null },
      transactionAt: { type: Date, default: null },
      completed: { type: Boolean, default: false },
    },
    contact: { name: String, phone: String, email: String, address: String },
    refundAccount: { bankName: String, accountNumber: String, accountHolder: String },
    history: {
      type: [{ _id: false, at: { type: Date, required: true }, status: { type: String, required: true }, note: { type: String, default: null } }],
      default: [],
    },
    requestedAt: { type: Date, required: true, index: true },
    approvedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'return_requests' },
);

returnRequestSchema.index({ status: 1, requestedAt: -1 });

export type ReturnRequestDocument = HydratedDocument<ReturnRequestDoc>;
export const ReturnRequestModel = model<ReturnRequestDoc>('ReturnRequest', returnRequestSchema);
