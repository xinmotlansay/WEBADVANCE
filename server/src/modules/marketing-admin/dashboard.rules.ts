import { AppError } from '../../utils/app-error.js';

/** Quy tắc tính số liệu Dashboard Marketing (FR-MKT_AD-002). Hàm thuần để test bằng dữ liệu tay. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VN = 7 * HOUR;

export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface Range {
  from: Date;
  /** Đầu ngày kế tiếp (không bao gồm). */
  to: Date;
  /** Kỳ liền trước có cùng độ dài, để so sánh. */
  prevFrom: Date;
  prevTo: Date;
}

const startOfVnDay = (t: number): number => Math.floor((t + VN) / DAY) * DAY - VN;
const rangeError = () =>
  new AppError(
    'E-MKT-002-01',
    400,
    'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc, không ở tương lai và tối đa 366 ngày.',
  );

/** Kỳ theo ngày giờ Việt Nam. `from`/`to` của kỳ tùy chọn là ngày `yyyy-MM-dd`, gồm cả ngày cuối. */
export function resolveRange(key: RangeKey, now: Date, from?: string, to?: string): Range {
  const today = startOfVnDay(now.getTime());
  const tomorrow = today + DAY;
  let start: number;
  let end = tomorrow;
  if (key === 'today') start = today;
  else if (key === '7d') start = today - 6 * DAY;
  else if (key === '30d') start = today - 29 * DAY;
  else if (key === 'month') {
    const d = new Date(now.getTime() + VN);
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN;
  } else {
    const a = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? Date.parse(`${from}T00:00:00Z`) - VN : NaN;
    const b = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? Date.parse(`${to}T00:00:00Z`) - VN : NaN;
    if (Number.isNaN(a) || Number.isNaN(b) || a > b || b > today || b - a >= 366 * DAY) {
      throw rangeError();
    }
    start = a;
    end = b + DAY;
  }
  const span = end - start;
  return {
    from: new Date(start),
    to: new Date(end),
    prevFrom: new Date(start - span),
    prevTo: new Date(start),
  };
}

export interface OrderLite {
  id: string;
  userId: string;
  createdAt: Date;
  status: string;
  totalAmount: number;
  shippingFee: number;
  promotionDiscount: number;
  voucherDiscount: number;
  voucherId?: string | null;
  items: { promotionId?: string | null; promotionDiscount: number; quantity: number }[];
}

const isCancelled = (o: OrderLite): boolean => o.status === 'CANCELLED';
/** Hoàn thành = đã giao thành công (DELIVERED). */
const isDone = (o: OrderLite): boolean => o.status === 'DELIVERED';
const hasOffer = (o: OrderLite): boolean =>
  o.promotionDiscount > 0 || o.voucherDiscount > 0 || !!o.voucherId;
/** Doanh thu không gồm phí vận chuyển. */
const revenueOf = (o: OrderLite): number => o.totalAmount - o.shippingFee;
const dayKey = (d: Date): string => new Date(d.getTime() + VN).toISOString().slice(0, 10);

export interface PromotionStat {
  id: string;
  orders: number;
  units: number;
  discount: number;
  revenue: number;
  cancelled: number;
  cancelRate: number;
}
export interface VoucherStat {
  id: string;
  uses: number;
  refunded: number;
  newCustomers: number;
  discount: number;
  revenue: number;
}
export interface DailyPoint {
  date: string;
  orders: number;
  voucherUses: number;
  discount: number;
  revenue: number;
}

export interface Summary {
  offerOrders: number;
  discountTotal: number;
  voucherUses: number;
  revenue: number;
  doneOrders: number;
  cancelRate: number;
  aovWithOffer: number | null;
  aovWithoutOffer: number | null;
  costRatio: number | null;
  byPromotion: PromotionStat[];
  byVoucher: VoucherStat[];
  daily: DailyPoint[];
}

/**
 * Gộp đơn trong kỳ. `firstDone`: userId → id đơn hoàn thành đầu tiên của khách (toàn thời gian),
 * dùng để xác định "khách mới". Đơn hủy không tính tiền giảm; đơn hoàn thành rồi trả hàng vẫn tính.
 */
export function summarize(orders: OrderLite[], firstDone: ReadonlyMap<string, string>): Summary {
  const offer = orders.filter(hasOffer);
  const live = offer.filter((o) => !isCancelled(o));
  const done = live.filter(isDone);
  const plainDone = orders.filter((o) => !hasOffer(o) && isDone(o));

  const promo = new Map<
    string,
    PromotionStat & { orderIds: Set<string>; cancelledIds: Set<string> }
  >();
  const voucher = new Map<string, VoucherStat>();
  const daily = new Map<string, DailyPoint>();
  const point = (d: Date): DailyPoint => {
    const k = dayKey(d);
    if (!daily.has(k))
      daily.set(k, { date: k, orders: 0, voucherUses: 0, discount: 0, revenue: 0 });
    return daily.get(k)!;
  };

  for (const o of offer) {
    const cancelled = isCancelled(o);
    // Chương trình: tính theo từng dòng; tiền giảm tách riêng theo nguồn (AC6).
    const seen = new Set<string>();
    for (const it of o.items) {
      if (!it.promotionId) continue;
      const s = promo.get(it.promotionId) ?? {
        id: it.promotionId,
        orders: 0,
        units: 0,
        discount: 0,
        revenue: 0,
        cancelled: 0,
        cancelRate: 0,
        orderIds: new Set<string>(),
        cancelledIds: new Set<string>(),
      };
      promo.set(it.promotionId, s);
      if (cancelled) s.cancelledIds.add(o.id);
      else {
        s.orderIds.add(o.id);
        s.units += it.quantity;
        s.discount += it.promotionDiscount;
        if (!seen.has(it.promotionId) && isDone(o)) s.revenue += revenueOf(o);
      }
      seen.add(it.promotionId);
    }
    if (o.voucherId) {
      const v = voucher.get(o.voucherId) ?? {
        id: o.voucherId,
        uses: 0,
        refunded: 0,
        newCustomers: 0,
        discount: 0,
        revenue: 0,
      };
      voucher.set(o.voucherId, v);
      if (cancelled) v.refunded += 1;
      else {
        v.uses += 1;
        v.discount += o.voucherDiscount;
        if (isDone(o)) {
          v.revenue += revenueOf(o);
          if (firstDone.get(o.userId) === o.id) v.newCustomers += 1;
        }
      }
    }
    if (!cancelled) {
      const p = point(o.createdAt);
      p.orders += 1;
      p.voucherUses += o.voucherId ? 1 : 0;
      p.discount += o.promotionDiscount + o.voucherDiscount;
      if (isDone(o)) p.revenue += revenueOf(o);
    }
  }

  const revenue = done.reduce((t, o) => t + revenueOf(o), 0);
  const doneDiscount = done.reduce((t, o) => t + o.promotionDiscount + o.voucherDiscount, 0);
  const avg = (list: OrderLite[]): number | null =>
    list.length ? Math.round(list.reduce((t, o) => t + revenueOf(o), 0) / list.length) : null;

  return {
    offerOrders: live.length,
    discountTotal: live.reduce((t, o) => t + o.promotionDiscount + o.voucherDiscount, 0),
    voucherUses: live.filter((o) => o.voucherId).length,
    revenue,
    doneOrders: done.length,
    cancelRate: offer.length ? (offer.length - live.length) / offer.length : 0,
    aovWithOffer: avg(done),
    aovWithoutOffer: avg(plainDone),
    costRatio: revenue > 0 ? doneDiscount / revenue : null,
    byPromotion: [...promo.values()].map(({ orderIds, cancelledIds, ...s }) => {
      const total = orderIds.size + cancelledIds.size;
      return {
        ...s,
        orders: orderIds.size,
        cancelled: cancelledIds.size,
        cancelRate: total ? cancelledIds.size / total : 0,
      };
    }),
    byVoucher: [...voucher.values()],
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Phần trăm thay đổi so với kỳ trước; `null` khi kỳ trước bằng 0 (không so sánh được). */
export function changePercent(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}
