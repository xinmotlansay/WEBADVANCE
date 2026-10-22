import type { ShippingConfig } from '../config/config.service.js';

/** Ngày dạng `YYYY-MM-DD` theo giờ Việt Nam. */
export type DateOnly = string;

export type DeliverySlot = 'MORNING' | 'AFTERNOON';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUNDAY = 0;

const toDate = (d: DateOnly): Date => new Date(`${d}T00:00:00Z`);
const fromDate = (d: Date): DateOnly => d.toISOString().slice(0, 10);

/** Ngày hiện tại theo giờ Việt Nam (đơn đặt lúc 23h30 UTC đã là ngày hôm sau ở VN). */
export function vnToday(now = new Date()): DateOnly {
  return fromDate(new Date(now.getTime() + VN_OFFSET_MS));
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromDate(new Date(toDate(date).getTime() + days * DAY_MS));
}

export function isSunday(date: DateOnly): boolean {
  return toDate(date).getUTCDay() === SUNDAY;
}

/** Cộng `days` ngày làm việc (Thứ 2–Thứ 7), không tính ngày bắt đầu. */
export function addWorkingDays(date: DateOnly, days: number): DateOnly {
  let current = date;
  for (let left = days; left > 0;) {
    current = addDays(current, 1);
    if (!isSunday(current)) left--;
  }
  return current;
}

/** BR-D01: hôm nay + số ngày chuẩn bị của cấp cao nhất trong đơn. */
export function estimateDeliveryDate(
  tiers: number[],
  shipping: ShippingConfig,
  now = new Date(),
): DateOnly {
  const lead = Math.max(0, ...tiers.map((t) => shipping.leadDays[String(t)] ?? 0));
  return addWorkingDays(vnToday(now), lead);
}

/** BR-D02: chỉ đơn có hàng do đội xe CaraVeso giao (cấp 3–4) mới được hẹn lịch. */
export function isSchedulable(tiers: number[], shipping: ShippingConfig): boolean {
  return tiers.some((t) => shipping.schedulableTiers.includes(t));
}

export interface DeliveryQuote {
  estimatedDeliveryDate: DateOnly;
  schedulable: boolean;
  minScheduleDate: DateOnly | null;
  maxScheduleDate: DateOnly | null;
  slots: DeliverySlot[];
}

export function quoteDelivery(
  tiers: number[],
  shipping: ShippingConfig,
  now = new Date(),
): DeliveryQuote {
  const estimatedDeliveryDate = estimateDeliveryDate(tiers, shipping, now);
  const schedulable = isSchedulable(tiers, shipping);
  return {
    estimatedDeliveryDate,
    schedulable,
    minScheduleDate: schedulable ? estimatedDeliveryDate : null,
    maxScheduleDate: schedulable
      ? addDays(estimatedDeliveryDate, shipping.scheduleMaxDaysAfterEstimate)
      : null,
    slots: schedulable ? shipping.slots.map((s) => s.code) : [],
  };
}

/** BR-D03: ngày hẹn trong khoảng cho phép, không phải Chủ nhật, khung giờ có trong cấu hình. */
export function isValidSchedule(
  schedule: { scheduledDate: DateOnly; scheduledSlot: DeliverySlot },
  quote: DeliveryQuote,
): boolean {
  const { scheduledDate, scheduledSlot } = schedule;
  return (
    quote.schedulable &&
    quote.minScheduleDate !== null &&
    quote.maxScheduleDate !== null &&
    scheduledDate >= quote.minScheduleDate &&
    scheduledDate <= quote.maxScheduleDate &&
    !isSunday(scheduledDate) &&
    quote.slots.includes(scheduledSlot)
  );
}
