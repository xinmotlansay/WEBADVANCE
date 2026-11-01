import { Types } from 'mongoose';
import { ReturnRequestModel } from '../after-sales/after-sales.model.js';
import { SystemConfigModel } from '../config/system-config.model.js';
import { OrderModel, type OrderStatus } from '../orders/order.model.js';
import { ShipmentModel } from '../orders/shipment.model.js';
import { AuditLogModel } from './audit-log.model.js';
import type { IRole } from '../auth/auth.model.js';

export type OverviewRange = 'today' | '7d' | '30d' | 'month';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

export const ORDER_STATUS_ORDER: OrderStatus[] = [
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

/** Đơn tính doanh thu: đã qua bước thanh toán và không bị hủy. */
const REVENUE_EXCLUDED: OrderStatus[] = ['PENDING_PAYMENT', 'CANCELLED'];

/** 0h ngày theo giờ Việt Nam (UTC+7) chứa thời điểm `at`. */
export function vnStartOfDay(at: Date): Date {
  const shifted = at.getTime() + VN_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - VN_OFFSET_MS);
}

/** Ngày 1 của tháng (giờ VN) lệch `monthOffset` tháng so với tháng chứa `at`. */
export function vnStartOfMonth(at: Date, monthOffset = 0): Date {
  const vn = new Date(at.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + monthOffset, 1) - VN_OFFSET_MS);
}

/** Kỳ đang xem và kỳ liền trước cùng độ dài, dùng tính mức thay đổi. */
export function resolveRange(range: OverviewRange, now: Date) {
  const today = vnStartOfDay(now);
  const end = new Date(today.getTime() + DAY_MS);
  let start: Date;
  if (range === 'today') start = today;
  else if (range === '7d') start = new Date(end.getTime() - 7 * DAY_MS);
  else if (range === '30d') start = new Date(end.getTime() - 30 * DAY_MS);
  else start = vnStartOfMonth(now);
  const length = end.getTime() - start.getTime();
  return { start, end, prevStart: new Date(start.getTime() - length), prevEnd: start };
}

/** Phần trăm thay đổi; kỳ trước bằng 0 thì không so được (null). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

interface PeriodStats {
  orders: number;
  revenue: number;
  revenueOrders: number;
  cancelled: number;
}

async function periodStats(start: Date, end: Date): Promise<PeriodStats> {
  const [row] = await OrderModel.aggregate<PeriodStats>([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, '$totalAmount'] } },
        revenueOrders: { $sum: { $cond: [{ $in: ['$status', REVENUE_EXCLUDED] }, 0, 1] } },
      },
    },
  ]);
  return row ?? { orders: 0, revenue: 0, revenueOrders: 0, cancelled: 0 };
}

async function returnCount(start: Date, end: Date): Promise<number> {
  return ReturnRequestModel.countDocuments({
    requestedAt: { $gte: start, $lt: end },
    status: { $nin: ['CANCELLED', 'REJECTED'] },
  });
}

async function revenueSum(start: Date, end: Date): Promise<number> {
  return (await periodStats(start, end)).revenue;
}

async function newVsReturning(start: Date, end: Date) {
  const [row] = await OrderModel.aggregate<{ newCustomers: number; returning: number }>([
    { $match: { createdAt: { $gte: start, $lt: end }, status: { $nin: REVENUE_EXCLUDED } } },
    { $group: { _id: '$userId' } },
    {
      $lookup: {
        from: 'orders',
        let: { uid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ['$userId', '$$uid'] }, { $lt: ['$createdAt', start] }] },
              status: { $nin: REVENUE_EXCLUDED },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'earlier',
      },
    },
    {
      $group: {
        _id: null,
        newCustomers: { $sum: { $cond: [{ $eq: [{ $size: '$earlier' }, 0] }, 1, 0] } },
        returning: { $sum: { $cond: [{ $gt: [{ $size: '$earlier' }, 0] }, 1, 0] } },
      },
    },
  ]);
  return { new: row?.newCustomers ?? 0, returning: row?.returning ?? 0 };
}

async function topSellers(start: Date, end: Date) {
  const base = [
    { $match: { createdAt: { $gte: start, $lt: end }, status: { $nin: REVENUE_EXCLUDED } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.variantId', quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.finalAmount' } } },
    { $lookup: { from: 'product_variants', localField: '_id', foreignField: '_id', as: 'variant' } },
    { $unwind: '$variant' },
    { $group: { _id: '$variant.productId', quantity: { $sum: '$quantity' }, revenue: { $sum: '$revenue' } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
  ];

  const [products, categories] = await Promise.all([
    OrderModel.aggregate<{ _id: Types.ObjectId; name: string; quantity: number; revenue: number }>([
      ...base,
      { $project: { name: '$product.name', quantity: 1, revenue: 1 } },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 5 },
    ]),
    OrderModel.aggregate<{ _id: Types.ObjectId; name: string; quantity: number; revenue: number }>([
      ...base,
      { $unwind: '$product.categoryIds' },
      { $group: { _id: '$product.categoryIds', quantity: { $sum: '$quantity' }, revenue: { $sum: '$revenue' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $project: { name: '$category.name', quantity: 1, revenue: 1 } },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const map = (row: { _id: Types.ObjectId; name: string; quantity: number; revenue: number }) => ({
    id: String(row._id),
    name: row.name,
    quantity: row.quantity,
    revenue: row.revenue,
  });
  return { topProducts: products.map(map), topCategories: categories.map(map) };
}

/** Doanh thu từng tháng của năm hiện tại (T1 → tháng này). */
async function revenueByMonth(now: Date) {
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const months = vnNow.getUTCMonth() + 1;
  const yearStart = vnStartOfMonth(now, -(months - 1));
  const rows = await OrderModel.aggregate<{ _id: number; revenue: number }>([
    { $match: { createdAt: { $gte: yearStart, $lt: vnStartOfMonth(now, 1) }, status: { $nin: REVENUE_EXCLUDED } } },
    { $group: { _id: { $month: { date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, revenue: { $sum: '$totalAmount' } } },
  ]);
  const byMonth = new Map(rows.map((row) => [row._id, row.revenue]));
  return Array.from({ length: months }, (_, i) => ({
    month: i + 1,
    year: vnNow.getUTCFullYear(),
    revenue: byMonth.get(i + 1) ?? 0,
  }));
}

async function overdueConfirmations(now: Date) {
  const value = (await SystemConfigModel.findById('policy.overdueConfirmationHours').lean())?.value;
  const thresholdHours = Number(value ?? 4) || 4;
  const orders = await OrderModel.find({ status: 'PENDING_CONFIRMATION' })
    .select('orderCode createdAt statusHistory')
    .lean();

  const overdue = orders
    .map((order) => {
      const entered = [...(order.statusHistory ?? [])]
        .reverse()
        .find((change) => change.toStatus === 'PENDING_CONFIRMATION')?.changedAt;
      const since = entered ?? order.createdAt;
      return { id: String(order._id), orderCode: order.orderCode, waitingMinutes: Math.floor((now.getTime() - since.getTime()) / 60_000) };
    })
    .filter((row) => row.waitingMinutes >= thresholdHours * 60)
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes);

  return { thresholdHours, count: overdue.length, items: overdue.slice(0, 5) };
}

async function recentOrders() {
  const orders = await OrderModel.find()
    .sort({ createdAt: -1 })
    .limit(8)
    .select('orderCode status totalAmount createdAt shippingAddress items payment.method payment.collectionType')
    .lean();
  const shipments = await ShipmentModel.find({ orderId: { $in: orders.map((o) => o._id) } })
    .select('orderId carrier assignedTeam')
    .lean();
  const shipmentByOrder = new Map(shipments.map((s) => [String(s.orderId), s]));

  return orders.map((order) => {
    const shipment = shipmentByOrder.get(String(order._id));
    const deliveredBy = shipment?.assignedTeam ? 'TEAM' : shipment?.carrier ? 'CARRIER' : null;
    return {
      id: String(order._id),
      orderCode: order.orderCode,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      customerName: order.shippingAddress.recipientName,
      address: [order.shippingAddress.addressLine, order.shippingAddress.ward, order.shippingAddress.province]
        .filter(Boolean)
        .join(', '),
      deliveredBy,
      carrierName: shipment?.assignedTeam ?? shipment?.carrier ?? null,
      paymentMethod: order.payment.method,
      collectionType: order.payment.collectionType,
      items: order.items.map((item) => ({ name: item.snapshot.name, quantity: item.quantity, amount: item.finalAmount })),
    };
  });
}

async function recentAdminActivity() {
  const rows = await AuditLogModel.find()
    .sort({ performedAt: -1 })
    .limit(5)
    .populate<{ userId: { profile: { fullName: string }; roleId: IRole } | null }>({
      path: 'userId',
      select: 'profile.fullName roleId',
      populate: { path: 'roleId', select: 'name' },
    })
    .lean();
  return rows.map((row) => ({
    id: String(row._id),
    actorName: row.userId?.profile?.fullName ?? 'Không rõ',
    roleName: row.userId?.roleId?.name ?? null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    performedAt: row.performedAt,
  }));
}

/** GET /admin/dashboard/overview (AD-02, API Design 11b.5). */
export async function getOverview(range: OverviewRange, now = new Date()) {
  const { start, end, prevStart, prevEnd } = resolveRange(range, now);
  const today = vnStartOfDay(now);
  const yesterday = new Date(today.getTime() - DAY_MS);

  const [
    current,
    previous,
    todayStats,
    yesterdayStats,
    returnsNow,
    returnsPrev,
    statusRows,
    revToday,
    rev7,
    rev30,
    byMonth,
    customers,
    sellers,
    overdue,
    orders,
    activity,
  ] = await Promise.all([
    periodStats(start, end),
    periodStats(prevStart, prevEnd),
    periodStats(today, new Date(today.getTime() + DAY_MS)),
    periodStats(yesterday, today),
    returnCount(start, end),
    returnCount(prevStart, prevEnd),
    OrderModel.aggregate<{ _id: OrderStatus; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    revenueSum(today, new Date(today.getTime() + DAY_MS)),
    revenueSum(new Date(today.getTime() - 6 * DAY_MS), new Date(today.getTime() + DAY_MS)),
    revenueSum(new Date(today.getTime() - 29 * DAY_MS), new Date(today.getTime() + DAY_MS)),
    revenueByMonth(now),
    newVsReturning(start, end),
    topSellers(start, end),
    overdueConfirmations(now),
    recentOrders(),
    recentAdminActivity(),
  ]);

  const counts = new Map(statusRows.map((row) => [row._id, row.count]));
  const averageOrderValue = current.revenueOrders ? Math.round(current.revenue / current.revenueOrders) : 0;
  const prevAverage = previous.revenueOrders ? Math.round(previous.revenue / previous.revenueOrders) : 0;
  const cancelRate = ratio(current.cancelled, current.orders);
  const prevCancelRate = ratio(previous.cancelled, previous.orders);
  const returnRate = ratio(returnsNow, current.revenueOrders);
  const prevReturnRate = ratio(returnsPrev, previous.revenueOrders);

  return {
    range,
    period: { from: start, to: end },
    revenue: {
      today: revToday,
      last7d: rev7,
      last30d: rev30,
      selected: current.revenue,
      selectedChangePercent: percentChange(current.revenue, previous.revenue),
      byMonth,
    },
    ordersToday: { count: todayStats.orders, changePercent: percentChange(todayStats.orders, yesterdayStats.orders) },
    ordersByStatus: Object.fromEntries(ORDER_STATUS_ORDER.map((status) => [status, counts.get(status) ?? 0])),
    averageOrderValue,
    averageOrderValueChangePercent: percentChange(averageOrderValue, prevAverage),
    cancelRate,
    cancelRateChangePoints: Math.round((cancelRate - prevCancelRate) * 10) / 10,
    returnRate,
    returnRateChangePoints: Math.round((returnRate - prevReturnRate) * 10) / 10,
    ...sellers,
    newVsReturningCustomers: customers,
    overdueConfirmationCount: overdue.count,
    overdueConfirmation: overdue,
    recentOrders: orders,
    recentAdminActivity: activity,
    generatedAt: now,
  };
}
