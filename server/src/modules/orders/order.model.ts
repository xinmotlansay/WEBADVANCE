import { Schema, model, type Types } from 'mongoose';
import type { PaymentMethod } from '../checkout/pricing.js';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'HANDED_OVER'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNING'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'DEPOSITED' | 'PAID' | 'UNPAID' | 'FAILED' | 'REFUNDED';
export type CollectionType = 'FULL' | 'DEPOSIT';
export type OrderSource = 'CART' | 'BUY_NOW';
export type InvoiceType = 'NONE' | 'PERSONAL' | 'COMPANY';

export interface ShippingAddress {
  recipientName: string;
  recipientPhone: string;
  email?: string;
  addressLine: string;
  ward: string;
  district?: string;
  province: string;
}

export interface OrderItem {
  _id: Types.ObjectId;
  variantId: Types.ObjectId;
  snapshot: { name: string; sku: string; color?: string; material?: string; dimensions?: string };
  quantity: number;
  unitPrice: number;
  promotionId?: Types.ObjectId | null;
  promotionDiscount: number;
  voucherDiscountShare: number;
  finalAmount: number;
  shippingTier: number;
  shippingFee: number;
  hasInstallation: boolean;
  installationFee: number;
  warrantyMonths: number;
}

export interface StatusChange {
  changedBy: Types.ObjectId | null;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  note?: string;
  changedAt: Date;
}

export interface InvoiceInfo {
  type: InvoiceType;
  buyerName?: string;
  taxCode?: string;
  address?: string;
  sendEmail: boolean;
  email?: string;
}

export interface OrderDoc {
  _id: Types.ObjectId;
  orderCode: string;
  userId: Types.ObjectId;
  /** Header `Idempotency-Key` của `POST /orders`, unique theo user (NF-08). */
  idempotencyKey: string;
  voucherId?: Types.ObjectId | null;
  shippingAddress: ShippingAddress;
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  totalAmount: number;
  status: OrderStatus;
  note?: string;
  items: OrderItem[];
  statusHistory: StatusChange[];
  payment: {
    method: PaymentMethod;
    collectionType: CollectionType;
    status: PaymentStatus;
    depositAmount?: number;
    codAmount?: number;
    dueAt?: Date;
    transferContent?: string;
    lastTransactionCode?: string;
    paidAt?: Date;
  };
  cancellation?: {
    reason?: string;
    cancelledBy: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
    cancelledByUserId?: Types.ObjectId | null;
    cancelledAt: Date;
  };
  source: OrderSource;
  invoiceInfo: InvoiceInfo;
  createdAt: Date;
  updatedAt: Date;
}

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'HANDED_OVER',
  'SHIPPING',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING',
  'CANCELLED',
];

const orderSchema = new Schema<OrderDoc>(
  {
    orderCode: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    idempotencyKey: { type: String, required: true },
    voucherId: { type: Schema.Types.ObjectId, ref: 'vouchers', default: null },
    shippingAddress: {
      recipientName: { type: String, required: true },
      recipientPhone: { type: String, required: true },
      email: String,
      addressLine: { type: String, required: true },
      ward: { type: String, required: true },
      district: String,
      province: { type: String, required: true },
    },
    subtotal: { type: Number, required: true },
    promotionDiscount: { type: Number, required: true, default: 0 },
    voucherDiscount: { type: Number, required: true, default: 0 },
    shippingFee: { type: Number, required: true },
    installationFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: { type: String, required: true, enum: ORDER_STATUSES, default: 'PENDING_PAYMENT' },
    note: { type: String, maxlength: 500 },
    items: [
      {
        variantId: { type: Schema.Types.ObjectId, ref: 'product_variants', required: true },
        snapshot: {
          name: { type: String, required: true },
          sku: { type: String, required: true },
          color: String,
          material: String,
          dimensions: String,
        },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true },
        promotionId: { type: Schema.Types.ObjectId, ref: 'promotions', default: null },
        promotionDiscount: { type: Number, default: 0 },
        voucherDiscountShare: { type: Number, default: 0 },
        finalAmount: { type: Number, required: true },
        shippingTier: Number,
        shippingFee: Number,
        hasInstallation: { type: Boolean, default: false },
        installationFee: { type: Number, default: 0 },
        warrantyMonths: { type: Number, required: true },
      },
    ],
    statusHistory: [
      {
        _id: false,
        changedBy: { type: Schema.Types.ObjectId, ref: 'users', default: null },
        fromStatus: { type: String, enum: ORDER_STATUSES },
        toStatus: { type: String, enum: ORDER_STATUSES, required: true },
        note: String,
        changedAt: { type: Date, required: true },
      },
    ],
    payment: {
      method: { type: String, required: true, enum: ['COD', 'BANK_TRANSFER'] },
      collectionType: { type: String, enum: ['FULL', 'DEPOSIT'], default: 'FULL' },
      status: {
        type: String,
        required: true,
        enum: ['PENDING', 'DEPOSITED', 'PAID', 'UNPAID', 'FAILED', 'REFUNDED'],
      },
      depositAmount: Number,
      codAmount: Number,
      dueAt: Date,
      transferContent: String,
      lastTransactionCode: String,
      paidAt: Date,
    },
    cancellation: {
      reason: String,
      cancelledBy: { type: String, enum: ['CUSTOMER', 'ADMIN', 'SYSTEM'] },
      cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'users', default: null },
      cancelledAt: Date,
    },
    source: { type: String, required: true, enum: ['CART', 'BUY_NOW'] },
    invoiceInfo: {
      type: {
        type: String,
        required: true,
        enum: ['NONE', 'PERSONAL', 'COMPANY'],
        default: 'NONE',
      },
      buyerName: String,
      taxCode: String,
      address: String,
      sendEmail: { type: Boolean, default: false },
      email: String,
    },
  },
  { timestamps: true },
);

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index(
  { 'payment.transferContent': 1 },
  { unique: true, partialFilterExpression: { 'payment.transferContent': { $type: 'string' } } },
);
// Job hết hạn thanh toán quét theo hai field này mỗi phút.
orderSchema.index({ status: 1, 'payment.dueAt': 1 });

export const OrderModel = model<OrderDoc>('orders', orderSchema);
