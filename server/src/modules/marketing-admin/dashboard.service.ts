import { Types } from 'mongoose';
import { z } from 'zod';
import { BannerModel } from '../banners/banner.model.js';
import { OrderModel } from '../orders/order.model.js';
import { PromotionModel } from '../promotions/promotion.model.js';
import { VoucherModel } from '../vouchers/voucher.model.js';
import {
  changePercent,
  resolveRange,
  summarize,
  type OrderLite,
  type RangeKey,
  type Summary,
} from './dashboard.rules.js';
import { bannerStatus, promotionStatus, voucherStatus } from './effective-status.js';
import { analyze } from './promotion-admin.service.js';
import { warnFlags } from './voucher-admin.rules.js';

export const dashboardQuerySchema = z.object({
  range: z.enum(['today', '7d', '30d', 'month', 'custom']).default('7d'),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const DAY = 86_400_000;

async function loadOrders(from: Date, to: Date): Promise<OrderLite[]> {
  // ponytail: nạp đơn của kỳ vào bộ nhớ rồi gộp bằng hàm thuần; chuyển sang $group khi kỳ có hàng chục nghìn đơn.
  const docs = await OrderModel.find(
    { createdAt: { $gte: from, $lt: to } },
    'userId createdAt status totalAmount shippingFee promotionDiscount voucherDiscount voucherId items.promotionId items.promotionDiscount items.quantity',
  ).lean();
  return docs.map((o) => ({
    id: String(o._id),
    userId: String(o.userId),
    createdAt: (o as unknown as { createdAt: Date }).createdAt,
    status: o.status,
    totalAmount: o.totalAmount,
    shippingFee: o.shippingFee,
    promotionDiscount: o.promotionDiscount,
    voucherDiscount: o.voucherDiscount,
    voucherId: o.voucherId ? String(o.voucherId) : null,
    items: o.items.map((i) => ({
      promotionId: i.promotionId ? String(i.promotionId) : null,
      promotionDiscount: i.promotionDiscount,
      quantity: i.quantity,
    })),
  }));
}

/** userId → id đơn hoàn thành đầu tiên (toàn thời gian), chỉ cho khách có đơn dùng mã trong kỳ. */
async function firstDoneOrders(orders: OrderLite[]): Promise<Map<string, string>> {
  const users = [
    ...new Set(orders.filter((o) => o.voucherId && o.status === 'DELIVERED').map((o) => o.userId)),
  ];
  if (users.length === 0) return new Map();
  const rows = await OrderModel.aggregate<{ _id: Types.ObjectId; first: Types.ObjectId }>([
    { $match: { userId: { $in: users.map((u) => new Types.ObjectId(u)) }, status: 'DELIVERED' } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$userId', first: { $first: '$_id' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), String(r.first)]));
}

async function period(from: Date, to: Date): Promise<Summary> {
  const orders = await loadOrders(from, to);
  return summarize(orders, await firstDoneOrders(orders));
}

/** Thẻ trạng thái, chỉ số theo kỳ (kèm thay đổi so với kỳ trước), Top 5, khối cần chú ý. */
export async function getDashboard(q: DashboardQuery, now = new Date()) {
  const range = resolveRange(q.range as RangeKey, now, q.from, q.to);
  const [cur, prev, promos, vouchers, banners] = await Promise.all([
    period(range.from, range.to),
    period(range.prevFrom, range.prevTo),
    PromotionModel.find().lean(),
    VoucherModel.find({ type: { $ne: 'ASSIGNED' } }).lean(),
    BannerModel.find({ deletedAt: null }).lean(),
  ]);

  const pStatus = promos.map((p) => ({ p, s: promotionStatus(p, now) }));
  const count = (s: string) => pStatus.filter((x) => x.s === s).length;
  const visibleBanners: Record<string, number> = {};
  for (const b of banners) {
    if (bannerStatus(b, now) === 'VISIBLE') {
      visibleBanners[b.position] = (visibleBanners[b.position] ?? 0) + 1;
    }
  }

  // Khối cần chú ý.
  const attention: { kind: string; text: string; link: string }[] = [];
  const in24h = now.getTime() + DAY;
  for (const { p, s } of pStatus) {
    if (s === 'RUNNING' && p.endDate.getTime() <= in24h) {
      attention.push({
        kind: 'PROMO_ENDING',
        text: `${p.name} sắp kết thúc trong 24 giờ`,
        link: `khuyen-mai/${p._id}/sua`,
      });
    }
    if (s === 'UPCOMING' && p.startDate.getTime() <= in24h) {
      attention.push({
        kind: 'PROMO_STARTING',
        text: `${p.name} sắp bắt đầu trong 24 giờ`,
        link: `khuyen-mai/${p._id}/sua`,
      });
    }
  }
  for (const v of vouchers) {
    if (warnFlags(v, voucherStatus(v, now), now).includes('NEAR_LIMIT')) {
      const pct = Math.floor((v.usedCount / v.totalUsageLimit!) * 100);
      attention.push({
        kind: 'VOUCHER_NEAR_LIMIT',
        text: `${v.code} đã dùng ${pct}% lượt`,
        link: 'ma-giam-gia',
      });
    }
  }
  const live = pStatus
    .filter((x) => ['RUNNING', 'UPCOMING', 'PAUSED'].includes(x.s))
    .map((x) => x.p);
  const info = await analyze(live);
  for (const p of live) {
    const lines = info.get(String(p._id))?.lines ?? [];
    const bad = lines.filter(
      (l) => l.warnings.includes('PRODUCT_UNAVAILABLE') || l.warnings.includes('OUT_OF_STOCK'),
    );
    const priced = lines.filter((l) => l.warnings.includes('PRICE_CHANGED'));
    const names = (ls: typeof lines) =>
      [...new Set(ls.map((l) => l.productName))].slice(0, 3).join(', ');
    if (bad.length) {
      attention.push({
        kind: 'PROMO_PRODUCT_AFFECTED',
        text: `${p.name}: sản phẩm bị ảnh hưởng (${names(bad)})`,
        link: `khuyen-mai/${p._id}/sua`,
      });
    }
    if (priced.length) {
      attention.push({
        kind: 'PROMO_PRICE_CHANGED',
        text: `${p.name}: giá gốc đã đổi (${names(priced)})`,
        link: `khuyen-mai/${p._id}/sua`,
      });
    }
  }


  // Voucher chiến dịch ML (ASSIGNED) không có trong `vouchers` nhưng vẫn có thể lọt Top 5.
  const assigned = await VoucherModel.find(
    { _id: { $in: cur.byVoucher.map((r) => new Types.ObjectId(r.id)) }, type: 'ASSIGNED' },
    'code',
  ).lean();
  const nameOf = new Map<string, string>([
    ...promos.map((p) => [String(p._id), `${p.code ?? ''} ${p.name}`.trim()] as const),
    ...[...vouchers, ...assigned].map((v) => [String(v._id), v.code] as const),
  ]);
  const top = <T extends { id: string }>(rows: T[], key: (r: T) => number) =>
    [...rows]
      .sort((a, b) => key(b) - key(a))
      .slice(0, 5)
      .map((r) => ({ ...r, name: nameOf.get(r.id) ?? r.id }));

  const m = (c: number, p: number) => ({ value: c, change: changePercent(c, p) });
  return {
    range: { key: q.range, from: range.from, to: range.to },
    updatedAt: now,
    cards: {
      promotions: {
        running: count('RUNNING'),
        upcoming: count('UPCOMING'),
        paused: count('PAUSED'),
      },
      vouchersActive: vouchers.filter((v) => voucherStatus(v, now) === 'ACTIVE').length,
      banners: visibleBanners,
    },
    metrics: {
      offerOrders: m(cur.offerOrders, prev.offerOrders),
      discountTotal: m(cur.discountTotal, prev.discountTotal),
      voucherUses: m(cur.voucherUses, prev.voucherUses),
      revenue: m(cur.revenue, prev.revenue),
    },
    top: {
      vouchers: top(cur.byVoucher, (r) => r.uses),
      promotions: top(cur.byPromotion, (r) => r.revenue),
    },
    attention,
  };
}

/** Khối hiệu quả chi tiết: chỉ số tổng hợp, bảng theo chương trình / mã, chuỗi theo ngày. */
export async function getEffectiveness(q: DashboardQuery, now = new Date()) {
  const range = resolveRange(q.range as RangeKey, now, q.from, q.to);
  const s = await period(range.from, range.to);
  const [promos, vouchers] = await Promise.all([
    PromotionModel.find(
      { _id: { $in: s.byPromotion.map((r) => new Types.ObjectId(r.id)) } },
      'code name',
    ).lean(),
    VoucherModel.find(
      { _id: { $in: s.byVoucher.map((r) => new Types.ObjectId(r.id)) } },
      'code usedCount totalUsageLimit',
    ).lean(),
  ]);
  const p = new Map(promos.map((x) => [String(x._id), x]));
  const v = new Map(vouchers.map((x) => [String(x._id), x]));
  return {
    range: { key: q.range, from: range.from, to: range.to },
    updatedAt: now,
    summary: {
      offerOrders: s.offerOrders,
      doneOrders: s.doneOrders,
      cancelRate: s.cancelRate,
      discountTotal: s.discountTotal,
      revenue: s.revenue,
      aovWithOffer: s.aovWithOffer,
      aovWithoutOffer: s.aovWithoutOffer,
      costRatio: s.costRatio,
    },
    byPromotion: s.byPromotion.map((r) => ({
      ...r,
      code: p.get(r.id)?.code ?? '',
      name: p.get(r.id)?.name ?? '(đã xóa)',
    })),
    byVoucher: s.byVoucher.map((r) => ({
      ...r,
      code: v.get(r.id)?.code ?? '(đã xóa)',
      usedCount: v.get(r.id)?.usedCount ?? 0,
      totalUsageLimit: v.get(r.id)?.totalUsageLimit ?? null,
    })),
    daily: s.daily,
  };
}
