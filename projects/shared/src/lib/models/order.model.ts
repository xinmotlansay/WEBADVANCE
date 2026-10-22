import type { CreateAddressRequest } from './address.model';
import type { CartItem, PriceSummary } from './cart.model';
import type { DeliverySlot } from './public-config.model';

export type CheckoutSource = 'CART' | 'BUY_NOW';
export type PaymentMethod = 'COD' | 'BANK_TRANSFER';
export type CollectionType = 'FULL' | 'DEPOSIT';
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

export interface BuyNowLine {
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
}

export interface DeliverySchedule {
  /** `YYYY-MM-DD`. */
  scheduledDate: string;
  scheduledSlot: DeliverySlot;
}

/** Body `POST /checkout/preview` (API Design 8.2). */
export interface CheckoutRequest {
  source: CheckoutSource;
  items?: BuyNowLine[] | null;
  addressId?: string | null;
  newAddress?: (Omit<CreateAddressRequest, 'isDefault'> & { saveAddress?: boolean }) | null;
  delivery?: DeliverySchedule | null;
}

export type InvoiceInfo =
  | { type: 'NONE' }
  | {
      type: 'PERSONAL' | 'COMPANY';
      buyerName: string;
      taxCode?: string;
      address: string;
      sendEmail: boolean;
      email?: string;
    };

/** Body `POST /orders` (API Design 8.3), gửi kèm header `Idempotency-Key`. */
export interface CreateOrderRequest extends CheckoutRequest {
  note?: string;
  payment: { method: PaymentMethod; collectionType: CollectionType };
  invoiceInfo: InvoiceInfo;
  expectedTotal: number;
}

export type BlockingCode =
  | 'NO_ITEMS'
  | 'OUT_OF_STOCK'
  | 'EXCEEDS_STOCK'
  | 'VARIANT_UNAVAILABLE'
  | 'ADDRESS_REQUIRED'
  | 'SCHEDULE_INVALID';

export interface BlockingIssue {
  code: BlockingCode;
  variantId?: string;
  available?: number;
}

export interface CheckoutItem extends Pick<CartItem, 'product' | 'variant' | 'pricing'> {
  /** Dòng giỏ tương ứng (nguồn `CART`); `null` với mua nhanh. */
  cartItemId: string | null;
  variantId: string;
  quantity: number;
  hasInstallation: boolean;
  shippingTier: number;
  shippingFee: number;
  installationFee: number;
  voucherDiscountShare: number;
  finalAmount: number;
  warnings: CartItem['warnings'];
  available?: number;
}

export interface ShippingAddress {
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  ward: string;
  district?: string | null;
  province: string;
}

export interface CheckoutPreview {
  source: CheckoutSource;
  items: CheckoutItem[];
  summary: PriceSummary;
  voucher: null;
  payment: {
    methodsAvailable: PaymentMethod[];
    depositRequired: boolean;
    depositRate: number;
    depositAmount: number;
    codAmountIfDeposit: number;
  };
  delivery: {
    estimatedDeliveryDate: string;
    schedulable: boolean;
    minScheduleDate: string | null;
    maxScheduleDate: string | null;
    slots: DeliverySlot[];
  };
  address: (ShippingAddress & { id: string | null }) | null;
  blockingIssues: BlockingIssue[];
  lastInvoiceInfo: InvoiceInfo | null;
}

/** Response `POST /orders` và `GET /orders/:id/payment` (API Design 8.3, 8.4). */
export interface OrderPayment {
  id: string;
  orderCode: string;
  status: OrderStatus;
  source: CheckoutSource;
  totalAmount: number;
  payment: {
    method: PaymentMethod;
    collectionType: CollectionType;
    status: PaymentStatus;
    amountDue: number;
    dueAt: string | null;
    secondsRemaining: number;
    qr: {
      imageUrl: string;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
      transferContent: string;
    } | null;
  };
  paid: boolean;
  expired: boolean;
}

/** `GET /orders/:id` (API Design 3.1, rút gọn). */
export interface OrderDetail {
  id: string;
  orderCode: string;
  status: OrderStatus;
  source: CheckoutSource;
  createdAt: string;
  shippingAddress: ShippingAddress;
  items: {
    id: string;
    variantId: string;
    snapshot: { name: string; sku: string; color?: string; material?: string; dimensions?: string };
    quantity: number;
    unitPrice: number;
    promotionDiscount: number;
    finalAmount: number;
    hasInstallation: boolean;
    installationFee: number;
    shippingFee: number;
  }[];
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  totalAmount: number;
  note: string | null;
  payment: {
    method: PaymentMethod;
    collectionType: CollectionType;
    status: PaymentStatus;
    depositAmount: number;
    codAmount: number;
    dueAt: string | null;
    paidAt: string | null;
  };
  shipment: {
    status: string;
    estimatedDeliveryDate: string | null;
    scheduledDate: string | null;
    scheduledSlot: DeliverySlot | null;
  } | null;
  invoiceInfo: InvoiceInfo;
  cancellation: { reason?: string; cancelledBy: string; cancelledAt: string } | null;
  allowedActions: { canCancel: boolean; canReschedule: boolean };
}

export interface CancelOrderRequest {
  reason: string;
  reasonNote?: string;
}
