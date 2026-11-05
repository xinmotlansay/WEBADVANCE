import type { OrderStatus } from '../enums/order.enum';
import type { LateCompensationStatus } from '../enums/warranty.enum';

export interface OrderDashboardSummary {
  countsByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  newOrdersToday: number;
  revenueToday: number;
  revenueLast7Days: number;
  paymentExceptionCount: number;
  pendingReturnCount: number;
  pendingWarrantyCount: number;
  pendingRefundCount: number;
  /** Số khoản hoàn tiền đang chờ chuyển trả khách (mọi nguồn: hủy đơn, giao thất bại, trả hàng, đối soát). */
  pendingRefundTransactionCount: number;
  pendingLateCompensationCount: number;
  overdueConfirmationCount: number;
  topProducts: Array<{ name: string; value: number }>;
  recentOrders: Array<{
    id: string;
    orderCode: string;
    status: OrderStatus;
    createdAt: string;
  }>;
  updatedAt: string;
}

export interface OrderReport {
  range: {
    from: string;
    to: string;
    label: string;
  };
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  cancelRate: number;
  returnRate: number;
  byStatus: Record<OrderStatus, number>;
  byMonth: Array<{
    month: string;
    label: string;
    revenue: number;
  }>;
  topProducts: Array<{
    name: string;
    value: number;
  }>;
  overdueConfirmationCount: number;
}

export type ReportPeriod = 'today' | '7d' | '30d' | 'month';

export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày gần nhất',
  '30d': '30 ngày gần nhất',
  month: 'Tháng này',
};

export interface AdminCustomer {
  id: string;
  fullName: string;
  email?: string | null;
  phoneNumber: string;
  joinedAt: string;
  status: 'ACTIVE' | 'LOCKED';
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string | null;
  addresses: Array<{
    recipientName: string;
    phone: string;
    addressLine: string;
    ward: string;
    district: string;
    province: string;
    isDefault: boolean;
  }>;
  recentOrders: Array<{
    id: string;
    orderCode: string;
    totalAmount: number;
    status: OrderStatus;
    createdAt: string;
  }>;
}

export interface AdminCustomerListQuery {
  q?: string;
  page?: number;
  limit?: number;
}

export interface LateCompensationRequest {
  id: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  daysLate: number;
  estimatedDeliveryDate: string;
  actualDeliveryDate?: string | null;
  voucherValue: number;
  status: LateCompensationStatus;
  requestedAt: string;
  reviewNote?: string | null;
}
