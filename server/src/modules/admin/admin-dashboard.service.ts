import type { Types } from 'mongoose';
import { OrderModel, type OrderStatus } from '../orders/order.model.js';
import { ReturnRequestModel } from '../after-sales/after-sales.model.js';
import { ProductModel } from '../products/product.model.js';
import { VariantModel } from '../products/variant.model.js';
import { CategoryModel } from '../categories/category.model.js';
import { SystemConfigModel } from '../config/system-config.model.js';
import { UserModel } from '../auth/auth.model.js';
import { ReviewModel } from '../reviews/review.model.js';
import { AuditLogModel } from './audit-log.model.js';

export type DashboardPeriod = 'today' | '7d' | '30d' | 'month';

const DAY = 86_400_000;
/** Giờ Việt Nam UTC+7, mọi mốc "hôm nay", "tháng này" tính theo giờ VN. */
const VN_OFFSET = 7 * 3_600_000;
/** Đơn chưa thành doanh thu: còn chờ thanh toán hoặc đã hủy. */
const NOT_REVENUE: OrderStatus[] = ['PENDING_PAYMENT', 'CANCELLED'];
const DEFAULT_OVERDUE_HOURS = 4;

function startOfVnDay(at: Date): Date {
  return new Date(Math.floor((at.getTime() + VN_OFFSET) / DAY) * DAY - VN_OFFSET);
}

function startOfVnMonth(at: Date, monthsBack = 0): Date {
  const vn = new Date(at.getTime() + VN_OFFSET);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() - monthsBack, 1) - VN_OFFSET);
}

/** Khoảng thời gian của kỳ đang xem và kỳ liền trước cùng độ dài để so sánh. */
export function periodRange(period: DashboardPeriod, now = new Date()) {
  const today = startOfVnDay(now);
  const from =
    period === 'today'
      ? today
      : period === 'month'
        ? startOfVnMonth(now)
        : new Date(today.getTime() - (period === '7d' ? 6 : 29) * DAY);
  const length = now.getTime() - from.getTime();
  const previousFrom =
    period === 'month' ? startOfVnMonth(now, 1) : new Date(from.getTime() - Math.max(length, DAY));
  return { from, to: now, previousFrom, previousTo: from };
}

function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

async function revenueBetween(from: Date, to: Date) {
  const [row] = await OrderModel.aggregate<{ revenue: number; orders: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, status: { $nin: NOT_REVENUE } } },
    { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
  ]);
  return { revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
}

async function rates(from: Date, to: Date) {
  const [all, cancelled, delivered, returns] = await Promise.all([
    OrderModel.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    OrderModel.countDocuments({ createdAt: { $gte: from, $lt: to }, status: 'CANCELLED' }),
    OrderModel.countDocuments({ createdAt: { $gte: from, $lt: to }, status: 'DELIVERED' }),
    ReturnRequestModel.countDocuments({ requestedAt: { $gte: from, $lt: to } }),
  ]);
  return {
    cancelRate: all ? cancelled / all : 0,
    returnRate: delivered ? returns / delivered : 0,
  };
}

async function customerMix(from: Date, to: Date) {
  const buyers = await OrderModel.distinct('userId', {
    createdAt: { $gte: from, $lt: to },
    status: { $nin: NOT_REVENUE },
  });
  const returning = buyers.length
    ? (
        await OrderModel.distinct('userId', {
          userId: { $in: buyers },
          createdAt: { $lt: from },
          status: { $nin: NOT_REVENUE },
        })
      ).length
    : 0;
  return { new: buyers.length - returning, returning };
}

async function overdueHours(): Promise<number> {
  const doc = await SystemConfigModel.findById('policy.overdueConfirmationHours').lean();
  const value = Number(doc?.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_OVERDUE_HOURS;
}

/** Số lượng bán theo sản phẩm (gộp biến thể) trong khoảng, sắp giảm dần. */
async function topSelling(from: Date, to: Date, limit: number, statuses?: OrderStatus[]) {
  const rows = await OrderModel.aggregate<{ _id: Types.ObjectId; quantity: number; revenue: number }>([
    {
      $match: {
        createdAt: { $gte: from, $lt: to },
        status: statuses ? { $in: statuses } : { $nin: NOT_REVENUE },
      },
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'items.variantId',
        foreignField: '_id',
        as: 'variant',
        pipeline: [{ $project: { productId: 1 } }],
      },
    },
    { $unwind: '$variant' },
    {
      $group: {
        _id: '$variant.productId',
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.finalAmount' },
      },
    },
    { $sort: { quantity: -1, revenue: -1 } },
    { $limit: limit },
  ]);
  const products = await ProductModel.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('name categoryIds')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return rows.map((row) => ({
    productId: String(row._id),
    name: byId.get(String(row._id))?.name ?? 'Sản phẩm đã xóa',
    categoryIds: (byId.get(String(row._id))?.categoryIds ?? []).map(String),
    quantity: row.quantity,
    revenue: row.revenue,
  }));
}

const ACTION_LABELS: Record<string, string> = {
  ORDER_CONFIRM: 'xác nhận đơn',
  ORDER_CANCEL: 'hủy đơn',
  PRODUCT_STATUS: 'đổi trạng thái sản phẩm',
  STOCK_ADJUST: 'cập nhật tồn kho',
};

async function recentActivity(limit: number) {
  const logs = await AuditLogModel.find().sort({ performedAt: -1 }).limit(limit).lean();
  const admins = await UserModel.find({ _id: { $in: logs.map((l) => l.userId) } })
    .select('profile.fullName roleId')
    .populate<{ roleId: { name: string } }>('roleId', 'name')
    .lean();
  const byId = new Map(admins.map((a) => [String(a._id), a]));
  return logs.map((log) => {
    const admin = byId.get(String(log.userId));
    const label = (log.newValue as { label?: string } | undefined)?.label;
    return {
      actor: admin?.profile.fullName ?? 'Admin',
      roleName: admin?.roleId?.name ?? '',
      action: ACTION_LABELS[log.action] ?? log.action,
      target: label ?? log.targetId,
      at: log.performedAt,
    };
  });
}

/** AD-02: Dashboard tổng quan của Admin cấp cao. */
export async function getOverview(period: DashboardPeriod, now = new Date()) {
  const range = periodRange(period, now);
  const today = startOfVnDay(now);
  const last30 = periodRange('30d', now);
  const hours = await overdueHours();
  const overdueBefore = new Date(now.getTime() - hours * 3_600_000);

  const [
    current,
    previous,
    todayStats,
    yesterdayStats,
    thirty,
    rateNow,
    ratePrev,
    customers,
    statusRows,
    overdueOrders,
    overdueCount,
    top,
    activity,
    months,
  ] = await Promise.all([
    revenueBetween(range.from, range.to),
    revenueBetween(range.previousFrom, range.previousTo),
    OrderModel.countDocuments({ createdAt: { $gte: today } }),
    OrderModel.countDocuments({ createdAt: { $gte: new Date(today.getTime() - DAY), $lt: today } }),
    revenueBetween(last30.from, last30.to),
    rates(last30.from, last30.to),
    rates(last30.previousFrom, last30.previousTo),
    customerMix(range.from, range.to),
    OrderModel.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    OrderModel.find({ status: 'PENDING_CONFIRMATION', createdAt: { $lt: overdueBefore } })
      .sort({ createdAt: 1 })
      .limit(3)
      .select('orderCode createdAt')
      .lean(),
    OrderModel.countDocuments({ status: 'PENDING_CONFIRMATION', createdAt: { $lt: overdueBefore } }),
    topSelling(last30.from, last30.to, 4),
    recentActivity(3),
    OrderModel.aggregate<{ _id: string; revenue: number }>([
      {
        $match: { createdAt: { $gte: startOfVnMonth(now, 9) }, status: { $nin: NOT_REVENUE } },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+07:00' } },
          revenue: { $sum: '$totalAmount' },
        },
      },
    ]),
  ]);

  const monthRevenue = new Map(months.map((m) => [m._id, m.revenue]));
  const revenueByMonth = Array.from({ length: 10 }, (_, i) => {
    const start = new Date(startOfVnMonth(now, 9 - i).getTime() + VN_OFFSET);
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month: key, label: `T${start.getUTCMonth() + 1}`, revenue: monthRevenue.get(key) ?? 0 };
  });

  return {
    period,
    range: { from: range.from, to: range.to },
    revenue: {
      value: current.revenue,
      previous: previous.revenue,
      change: change(current.revenue, previous.revenue),
      orders: current.orders,
    },
    kpis: {
      ordersToday: todayStats,
      ordersTodayChange: change(todayStats, yesterdayStats),
      averageOrderValue: thirty.orders ? Math.round(thirty.revenue / thirty.orders) : 0,
      cancelRate: rateNow.cancelRate,
      cancelRateDelta: rateNow.cancelRate - ratePrev.cancelRate,
      returnRate: rateNow.returnRate,
      returnRateDelta: rateNow.returnRate - ratePrev.returnRate,
    },
    revenueByMonth,
    ordersByStatus: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
    customers,
    overdue: {
      thresholdHours: hours,
      count: overdueCount,
      orders: overdueOrders.map((order) => ({
        id: String(order._id),
        orderCode: order.orderCode,
        createdAt: order.createdAt,
      })),
    },
    topProducts: top.map(({ categoryIds: _c, ...rest }) => rest),
    recentActivity: activity,
  };
}

/** PA-02: Dashboard sản phẩm (cột tổng quan bên phải trang Sản phẩm). */
export async function getProductDashboard(now = new Date()) {
  const last30 = periodRange('30d', now);
  const [statusRows, categoryCount, variantCount, lowStock, outOfStock, incomplete, sold, top] =
    await Promise.all([
      ProductModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      CategoryModel.countDocuments(),
      VariantModel.countDocuments({ status: 'ACTIVE' }),
      VariantModel.countDocuments({
        status: 'ACTIVE',
        stockQuantity: { $gt: 0 },
        $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
      }),
      VariantModel.countDocuments({ status: 'ACTIVE', stockQuantity: 0 }),
      ProductModel.countDocuments({ status: 'DRAFT' }),
      OrderModel.aggregate<{ quantity: number }>([
        { $match: { createdAt: { $gte: last30.from }, status: 'DELIVERED' } },
        { $unwind: '$items' },
        { $group: { _id: null, quantity: { $sum: '$items.quantity' } } },
      ]),
      topSelling(last30.from, last30.to, 4),
    ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const newSince = new Date(now.getTime() - 30 * DAY);
  const newCount = await ProductModel.countDocuments({ listedAt: { $gte: newSince } });
  const bestSellerCount = await ProductModel.countDocuments({ isAutoBestSeller: true });
  const [reported, rating] = await Promise.all([
    ReviewModel.countDocuments({
      status: 'VISIBLE',
      'reports.0': { $exists: true },
      $or: [
        { reportsReviewedAt: { $exists: false } },
        { $expr: { $gt: [{ $max: '$reports.reportedAt' }, '$reportsReviewedAt'] } },
      ],
    }),
    ReviewModel.aggregate<{ avg: number }>([
      { $match: { status: 'VISIBLE' } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]),
  ]);
  return {
    totalProducts: statusRows.reduce((sum, row) => sum + row.count, 0),
    byStatus,
    categoryCount,
    variantCount,
    alerts: { lowStock, outOfStock, incomplete, reportedReviews: reported },
    last30Days: {
      soldQuantity: sold[0]?.quantity ?? 0,
      newProducts: newCount,
      bestSellers: bestSellerCount,
      averageRating: rating[0]?.avg ?? null,
    },
    topSelling: top.map(({ categoryIds: _c, ...rest }) => rest),
  };
}
