import type { BannerDoc } from '../banners/banner.model.js';
import type { PromotionDoc } from '../promotions/promotion.model.js';
import type { VoucherDoc } from '../vouchers/voucher.model.js';

/**
 * Trạng thái hiển thị tính lúc đọc từ trạng thái do người chọn + thời gian + lượt dùng (FRD 1.3),
 * nên không cần job tự chuyển trạng thái.
 */

export type PromotionStatus = 'DRAFT' | 'UPCOMING' | 'RUNNING' | 'PAUSED' | 'ENDED';

export function promotionStatus(
  p: Pick<PromotionDoc, 'state' | 'status' | 'startDate' | 'endDate'>,
  now = new Date(),
): PromotionStatus {
  // Dữ liệu cũ chưa có `state`: suy từ `status` cũ.
  const state = p.state ?? (p.status === 'PAUSED' || p.status === 'ENDED' ? p.status : 'ACTIVE');
  if (state === 'DRAFT') return 'DRAFT';
  if (state === 'ENDED' || now > p.endDate) return 'ENDED';
  if (state === 'PAUSED') return 'PAUSED';
  return now < p.startDate ? 'UPCOMING' : 'RUNNING';
}

export type VoucherStatus = 'UPCOMING' | 'ACTIVE' | 'USED_UP' | 'EXPIRED' | 'DISABLED';

export function voucherStatus(
  v: Pick<
    VoucherDoc,
    'status' | 'disabledAt' | 'startDate' | 'endDate' | 'usedCount' | 'totalUsageLimit'
  >,
  now = new Date(),
): VoucherStatus {
  if (v.disabledAt || v.status === 'PAUSED') return 'DISABLED';
  if (v.status === 'EXPIRED' || now > v.endDate) return 'EXPIRED';
  if (now < v.startDate) return 'UPCOMING';
  if (v.totalUsageLimit != null && v.usedCount >= v.totalUsageLimit) return 'USED_UP';
  return 'ACTIVE';
}

export type BannerStatus = 'DRAFT' | 'SCHEDULED' | 'VISIBLE' | 'HIDDEN' | 'EXPIRED';

export function bannerStatus(
  b: Pick<BannerDoc, 'status' | 'startDate' | 'endDate'>,
  now = new Date(),
): BannerStatus {
  if (b.status === 'DRAFT') return 'DRAFT';
  if (b.endDate && now > b.endDate) return 'EXPIRED';
  if (b.status === 'HIDDEN') return 'HIDDEN';
  return now < b.startDate ? 'SCHEDULED' : 'VISIBLE';
}
