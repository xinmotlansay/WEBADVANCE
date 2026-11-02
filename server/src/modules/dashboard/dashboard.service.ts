import {
  LateCompensationStatus,
  OrderStatus,
  ReconciliationStatus,
  ReturnStatus,
  WarrantyStatus,
} from '../../lib/shared-enums.js';
import type { OrderDashboardSummary, OrderReport, ReportPeriod } from '../../lib/shared-types.js';
import { LateCompensationRequestModel } from '../orders/late-compensation.model.js';
import { OrderModel, toSharedOrderStatus, type OrderDocument } from '../orders/order.model.js';
import { PaymentTransactionModel } from '../payments/payment.model.js';
import { ReturnRequestModel } from '../returns/return.model.js';
import { WarrantyRequestModel } from '../warranty/warranty.model.js';

function statusCounts(orders: Pick<OrderDocument, 'status'>[]): Record<OrderStatus, number> {
  const counts = Object.fromEntries(
    Object.values(OrderStatus).map((status) => [status, 0]),
  ) as Record<OrderStatus, number>;
  for (const order of orders) counts[order.status] += 1;
  return counts;
}

function periodRange(period: ReportPeriod, now: Date): { from: Date; to: Date; label: string } {
  const to = new Date(now);
  const from = new Date(now);
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      return { from, to, label: 'Hôm nay' };
    case '7d':
      from.setDate(from.getDate() - 7);
      return { from, to, label: '7 ngày gần nhất' };
    case '30d':
      from.setDate(from.getDate() - 30);
      return { from, to, label: '30 ngày gần nhất' };
    case 'month':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      return { from, to, label: 'Tháng này' };
  }
}

export async function getOrderDashboardSummary(): Promise<OrderDashboardSummary> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const overdueBoundary = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const [
    orders,
    todayDelivered,
    weekDelivered,
    paymentExceptionCount,
    pendingReturnCount,
    pendingWarrantyCount,
    pendingRefundCount,
    pendingLateCompensationCount,
    overdueConfirmationCount,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    OrderModel.find().select('status createdAt totalAmount').lean(),
    OrderModel.aggregate([
      { $match: { status: OrderStatus.DELIVERED, createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    OrderModel.aggregate([
      { $match: { status: OrderStatus.DELIVERED, createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    PaymentTransactionModel.countDocuments({
      reconciliationStatus: {
        $in: [
          ReconciliationStatus.WRONG_CONTENT,
          ReconciliationStatus.UNDERPAID,
          ReconciliationStatus.OVERPAID,
          ReconciliationStatus.LATE,
        ],
      },
    }),
    ReturnRequestModel.countDocuments({ status: ReturnStatus.PENDING }),
    WarrantyRequestModel.countDocuments({ status: WarrantyStatus.PENDING_CONFIRMATION }),
    ReturnRequestModel.countDocuments({
      type: 'RETURN',
      status: ReturnStatus.PROCESSING,
      'refund.completed': false,
    }),
    LateCompensationRequestModel.countDocuments({ status: LateCompensationStatus.PENDING }),
    OrderModel.countDocuments({
      status: OrderStatus.PENDING_CONFIRMATION,
      createdAt: { $lte: overdueBoundary },
    }),
    OrderModel.aggregate([
      { $match: { status: OrderStatus.DELIVERED } },
      { $unwind: '$items' },
      { $group: { _id: '$items.snapshot.name', value: { $sum: '$items.finalAmount' } } },
      { $sort: { value: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$_id', value: 1 } },
    ]),
    OrderModel.find().select('orderCode status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return {
    countsByStatus: statusCounts(orders),
    totalOrders: orders.length,
    newOrdersToday: orders.filter((order) => order.createdAt >= today).length,
    revenueToday: todayDelivered[0]?.total ?? 0,
    revenueLast7Days: weekDelivered[0]?.total ?? 0,
    paymentExceptionCount,
    pendingReturnCount,
    pendingWarrantyCount,
    pendingRefundCount,
    pendingLateCompensationCount,
    overdueConfirmationCount,
    topProducts,
    recentOrders: recentOrders.map((order) => ({
      id: String(order._id),
      orderCode: order.orderCode,
      status: toSharedOrderStatus(order.status),
      createdAt: order.createdAt.toISOString(),
    })),
    updatedAt: now.toISOString(),
  };
}

export async function getOrderReport(period: ReportPeriod): Promise<OrderReport> {
  const now = new Date();
  const range = periodRange(period, now);
  const orders = await OrderModel.find({ createdAt: { $gte: range.from, $lte: range.to } })
    .select('status totalAmount createdAt items')
    .sort({ createdAt: 1 })
    .lean();
  const counts = statusCounts(orders);
  const delivered = orders.filter((order) => order.status === OrderStatus.DELIVERED);
  const revenue = delivered.reduce((sum, order) => sum + order.totalAmount, 0);
  const orderIds = orders.map((order) => order._id);
  const [returnCount, overdueConfirmationCount] = await Promise.all([
    ReturnRequestModel.countDocuments({
      orderId: { $in: orderIds },
      status: { $ne: ReturnStatus.REJECTED },
    }),
    OrderModel.countDocuments({
      _id: { $in: orderIds },
      status: OrderStatus.PENDING_CONFIRMATION,
      createdAt: { $lte: new Date(now.getTime() - 20 * 60 * 60 * 1000) },
    }),
  ]);
  const products = new Map<string, number>();
  for (const order of delivered) {
    for (const item of order.items) {
      products.set(item.snapshot.name, (products.get(item.snapshot.name) ?? 0) + item.finalAmount);
    }
  }
  const byMonth = new Map<string, number>();
  for (const order of delivered) {
    const key = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + order.totalAmount);
  }
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    totalOrders: orders.length,
    totalRevenue: revenue,
    averageOrderValue: delivered.length ? Math.round(revenue / delivered.length) : 0,
    cancelRate: orders.length ? (counts[OrderStatus.CANCELLED] / orders.length) * 100 : 0,
    returnRate: orders.length ? (returnCount / orders.length) * 100 : 0,
    byStatus: counts,
    byMonth: [...byMonth.entries()].map(([month, value]) => ({
      month,
      label: `${month.slice(5)}/${month.slice(0, 4)}`,
      revenue: value,
    })),
    topProducts: [...products.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value })),
    overdueConfirmationCount,
  };
}
