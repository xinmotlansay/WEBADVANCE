import type { CancellationActor, OrderStatus } from '../enums/order.enum';
import type {
  OrderPaymentStatus,
  PaymentCollectionType,
  PaymentMethod,
  RefundStatus,
} from '../enums/payment.enum';
import type { DeliverySlot, ShipmentStatus } from '../enums/shipping.enum';

export interface OrderAddress {
  recipientName: string;
  recipientPhone: string;
  email?: string | null;
  addressLine: string;
  ward: string;
  district: string;
  province: string;
}

export interface OrderItem {
  id: string;
  variantId: string;
  name: string;
  sku: string;
  color?: string | null;
  material?: string | null;
  dimensions?: string | null;
  quantity: number;
  unitPrice: number;
  promotionDiscount: number;
  voucherDiscountShare: number;
  finalAmount: number;
  shippingTier: number;
  shippingFee: number;
  hasInstallation: boolean;
  installationFee: number;
  warrantyMonths: number;
  imageUrl?: string | null;
}

export interface OrderStatusHistoryEntry {
  at: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note?: string | null;
  changedBy?: string | null;
}

export interface OrderShipment {
  id: string;
  carrier?: string | null;
  trackingCode?: string | null;
  assignedTeam?: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate?: string | null;
  scheduledDate?: string | null;
  scheduledSlot?: DeliverySlot | null;
  rescheduleCount: number;
  redeliveryCount: number;
  failureReason?: string | null;
  actualShippingCost?: number | null;
  actualDeliveryDate?: string | null;
  installationSchedule?: string | null;
}

export interface OrderPaymentSummary {
  method: PaymentMethod;
  collectionType: PaymentCollectionType;
  status: OrderPaymentStatus;
  depositAmount?: number | null;
  codAmount?: number | null;
  dueAt?: string | null;
  transferContent?: string | null;
  lastTransactionCode?: string | null;
  paidAt?: string | null;
  refund?: {
    amount: number;
    status: RefundStatus;
    expectedBy?: string | null;
  } | null;
}

export interface OrderTotals {
  subtotal: number;
  promotionDiscount: number;
  voucherDiscount: number;
  shippingFee: number;
  installationFee: number;
  totalAmount: number;
}

export interface OrderCancellation {
  reason?: string | null;
  note?: string | null;
  cancelledBy?: CancellationActor | null;
  cancelledAt?: string | null;
}

export interface OrderListItem {
  id: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  itemCount: number;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  isOverdue: boolean;
}

export interface OrderDetail {
  id: string;
  orderCode: string;
  customer: {
    id: string;
    fullName: string;
    email?: string | null;
    phoneNumber: string;
  };
  shippingAddress: OrderAddress;
  items: OrderItem[];
  totals: OrderTotals;
  status: OrderStatus;
  allowedNext: OrderStatus[];
  note?: string | null;
  payment: OrderPaymentSummary;
  shipment: OrderShipment | null;
  statusHistory: OrderStatusHistoryEntry[];
  cancellation: OrderCancellation | null;
  createdAt: string;
  updatedAt: string;
  invoiceNumber?: string | null;
}

export interface OrderListQuery {
  q?: string;
  status?: OrderStatus | 'ALL';
  paymentStatus?: OrderPaymentStatus | 'ALL';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface CancelOrderRequest {
  reason: string;
  note?: string;
  refundToCustomer?: boolean;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  note?: string;
}

export interface UpdateShipmentRequest {
  carrier?: string | null;
  trackingCode?: string | null;
  assignedTeam?: string | null;
  installationSchedule?: string | null;
  handover?: boolean;
}

export interface DeliveryFailedRequest {
  failureReason: string;
  note?: string;
}

export interface FinalizeReturnRequest {
  actualShippingCost: number;
  note?: string;
}

export interface OrderCustomerSummary {
  id: string;
  fullName: string;
  email?: string | null;
  phoneNumber: string;
  orderCount: number;
  totalSpent: number;
  joinedAt: string;
  locked: boolean;
}
