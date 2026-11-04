import { Schema, model, type Types } from 'mongoose';
export interface OrderItemDoc {
  _id: Types.ObjectId;
  variantId: Types.ObjectId;
  snapshot: { name: string; sku: string; color?: string; material?: string; dimensions?: string };
  quantity: number;
  finalAmount: number;
}
export interface OrderDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderCode: string;
  status: string;
  items: OrderItemDoc[];
  shippingAddress: { recipientName: string; recipientPhone: string; addressLine: string };
  createdAt: Date;
  totalAmount: number;
  afterSalesVersion?: number;
}
// Cùng collection `orders` với module orders; tên model riêng để không trùng đăng ký trong mongoose.
export const OrderModel = model<OrderDoc>(
  'AfterSalesOrder',
  new Schema<OrderDoc>(
    {
      userId: Schema.Types.ObjectId,
      orderCode: String,
      status: String,
      items: [
        {
          variantId: Schema.Types.ObjectId,
          snapshot: { name: String, sku: String },
          quantity: Number,
          finalAmount: Number,
        },
      ],
      shippingAddress: { recipientName: String, recipientPhone: String, addressLine: String },
      createdAt: Date,
      totalAmount: Number,
      afterSalesVersion: { type: Number, default: 0 },
    },
    { strict: false, collection: 'orders' },
  ),
);
export const ShipmentModel = model<{ orderId: Types.ObjectId; actualDeliveryDate?: Date }>(
  'AfterSalesShipment',
  new Schema(
    { orderId: Schema.Types.ObjectId, actualDeliveryDate: Date },
    { strict: false, collection: 'shipments' },
  ),
);
export interface WarrantyCardDoc {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId?: Types.ObjectId;
  serialNumber?: string;
  quantity: number;
  warrantyMonths: number;
  activatedAt: Date;
  expiresAt: Date;
  status: 'VALID' | 'EXPIRED' | 'VOID';
}
export const WarrantyCardModel = model<WarrantyCardDoc>(
  'warranty_cards',
  new Schema(
    {
      orderId: Schema.Types.ObjectId,
      orderItemId: Schema.Types.ObjectId,
      serialNumber: String,
      quantity: Number,
      warrantyMonths: Number,
      activatedAt: Date,
      expiresAt: Date,
      status: String,
    },
    { strict: false },
  ),
);
export interface Contact {
  name: string;
  phone: string;
  email?: string;
  address: string;
}
export interface TimelineEntry {
  status: string;
  at: Date;
  note?: string;
}
export interface WarrantyRequestDoc {
  _id: Types.ObjectId;
  /** Mã yêu cầu (BH-...), có chỉ mục unique dùng chung với màn Order Admin. */
  code?: string;
  orderId?: Types.ObjectId;
  orderItemId?: Types.ObjectId;
  userId: Types.ObjectId;
  warrantyCardId: Types.ObjectId;
  defectType?: string;
  defectDescription: string;
  evidence: string[];
  contact: Contact;
  status: string;
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  rejectReason?: string;
  inspectionResult?: string;
  resolution?: string;
  timeline: TimelineEntry[];
  /** Lịch sử xử lý ghi bởi Order Admin. */
  history?: { at: Date; status: string; note?: string | null }[];
  homeServiceSchedule?: Date | null;
  customerShipment?: { trackingCode?: string | null };
  returnShipment?: { trackingCode?: string | null };
}
const contactSchema = new Schema<Contact>(
  { name: String, phone: String, email: String, address: String },
  { _id: false },
);
const timelineSchema = new Schema<TimelineEntry>(
  { status: String, at: Date, note: String },
  { _id: false },
);
export const WarrantyRequestModel = model<WarrantyRequestDoc>(
  'warranty_requests',
  new Schema<WarrantyRequestDoc>(
    {
      code: String,
      orderId: Schema.Types.ObjectId,
      orderItemId: Schema.Types.ObjectId,
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      warrantyCardId: { type: Schema.Types.ObjectId, required: true },
      defectType: String,
      defectDescription: String,
      evidence: [String],
      contact: contactSchema,
      status: String,
      requestedAt: Date,
      approvedAt: Date,
      completedAt: Date,
      rejectReason: String,
      inspectionResult: String,
      resolution: String,
      timeline: [timelineSchema],
      // Lịch sử xử lý do Order Admin ghi (cùng collection với màn Bảo hành bên admin).
      history: [{ _id: false, at: Date, status: String, note: String }],
      homeServiceSchedule: Date,
      customerShipment: { trackingCode: String },
      returnShipment: { trackingCode: String },
    },
    { timestamps: true },
  ),
);
export interface ReturnRequestDoc {
  _id: Types.ObjectId;
  /** Mã yêu cầu (RT-...), có chỉ mục unique dùng chung với màn Order Admin. */
  code?: string;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderItemId: Types.ObjectId;
  type: 'RETURN' | 'EXCHANGE';
  quantity: number;
  reason: string;
  description: string;
  evidence: string[];
  contact: Contact;
  status: string;
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  rejectReason?: string;
  refundAmount?: number;
  resolution?: string;
  refundAccount?: { bankName: string; accountNumber: string; accountHolder: string };
  replacement?: { variantId: Types.ObjectId; quantity: number; unitPrice: number };
  timeline: TimelineEntry[];
}
export const ReturnRequestModel = model<ReturnRequestDoc>(
  'return_requests',
  new Schema<ReturnRequestDoc>(
    {
      code: String,
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      orderId: Schema.Types.ObjectId,
      orderItemId: Schema.Types.ObjectId,
      type: String,
      quantity: Number,
      reason: String,
      description: String,
      evidence: [String],
      contact: contactSchema,
      status: String,
      requestedAt: Date,
      approvedAt: Date,
      completedAt: Date,
      rejectReason: String,
      refundAmount: Number,
      resolution: String,
      refundAccount: {
        bankName: String,
        accountNumber: { type: String, select: false },
        accountHolder: String,
      },
      replacement: { variantId: Schema.Types.ObjectId, quantity: Number, unitPrice: Number },
      timeline: [timelineSchema],
    },
    { timestamps: true, strict: false },
  ),
);
export interface UploadedFileDoc {
  _id: string;
  userId: Types.ObjectId;
  purpose: string;
  url: string;
  mime: string;
  size: number;
  createdAt: Date;
}
export const UploadedFileModel = model<UploadedFileDoc>(
  'uploaded_files',
  new Schema({
    _id: String,
    userId: Schema.Types.ObjectId,
    purpose: String,
    url: String,
    mime: String,
    size: Number,
    createdAt: Date,
  }),
);
