import { calcVoucherDiscount, type VoucherRule } from '../checkout/pricing.js';
import type { VoucherDoc } from './voucher.model.js';

/** Lý do voucher không áp dụng được (API Design 7.3). */
export type VoucherReason =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'NOT_STARTED'
  | 'PAUSED'
  | 'USAGE_LIMIT_REACHED'
  | 'PER_USER_LIMIT_REACHED'
  | 'MIN_ORDER_NOT_MET'
  | 'SCOPE_NOT_MATCHED'
  | 'CUSTOMER_GROUP_NOT_ELIGIBLE'
  | 'NOT_STACKABLE'
  /** Giỏ đang có voucher, phải gỡ voucher cũ mới áp được mã mới (mỗi đơn tối đa một voucher). */
  | 'VOUCHER_ALREADY_APPLIED';

/** Một dòng được chọn trong giỏ hoặc đơn mua ngay, giá đã trừ khuyến mãi. */
export interface VoucherLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  /** Tiền hàng sau khuyến mãi của dòng. */
  finalAmount: number;
  hasPromotion: boolean;
}

export interface VoucherContext {
  now: Date;
  lines: VoucherLine[];
  /** Số lượt khách này đã dùng voucher (không tính lượt đã hoàn). */
  userUsedCount: number;
  /** Khách thuộc nhóm của voucher, và có voucher trong ví nếu voucher cần ví. */
  customerEligible: boolean;
}

export type VoucherCheck =
  | { valid: true; discount: number; rule: VoucherRule }
  | { valid: false; reason: VoucherReason; message: string };

const money = (value: number): string => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

const fail = (reason: VoucherReason, message: string): VoucherCheck => ({
  valid: false,
  reason,
  message,
});

/** Dòng nằm trong phạm vi voucher; phạm vi rỗng là toàn đơn. */
function inScope(scope: VoucherDoc['scope'], line: VoucherLine): boolean {
  if (scope.length === 0) return true;
  return scope.some(
    (s) =>
      (s.productId && s.productId.toString() === line.productId) ||
      (s.categoryId && line.categoryIds.includes(s.categoryId.toString())),
  );
}

/**
 * Kiểm tra voucher với giỏ hiện tại (FR-30, API Design 7.3). Thứ tự kiểm tra cũng là thứ tự ưu tiên
 * của lý do trả về. Voucher không cộng với khuyến mãi thì bỏ qua các dòng đang khuyến mãi.
 */
export function checkVoucher(voucher: VoucherDoc, ctx: VoucherContext): VoucherCheck {
  const { now, lines } = ctx;
  if (voucher.status === 'PAUSED') return fail('PAUSED', 'Mã giảm giá đang tạm dừng');
  if (voucher.status === 'EXPIRED' || now > voucher.endDate) {
    return fail('EXPIRED', 'Mã giảm giá đã hết hạn');
  }
  if (now < voucher.startDate) return fail('NOT_STARTED', 'Mã giảm giá chưa đến ngày áp dụng');
  if (voucher.totalUsageLimit != null && voucher.usedCount >= voucher.totalUsageLimit) {
    return fail('USAGE_LIMIT_REACHED', 'Mã giảm giá đã hết lượt sử dụng');
  }
  if (ctx.userUsedCount >= voucher.perUserLimit) {
    return fail('PER_USER_LIMIT_REACHED', 'Bạn đã dùng hết lượt của mã giảm giá này');
  }
  if (!ctx.customerEligible) {
    return fail('CUSTOMER_GROUP_NOT_ELIGIBLE', 'Mã giảm giá không áp dụng cho tài khoản của bạn');
  }

  let eligible = lines;
  if (lines.length > 0) {
    eligible = lines.filter((l) => inScope(voucher.scope, l));
    if (eligible.length === 0) {
      return fail('SCOPE_NOT_MATCHED', 'Mã giảm giá không áp dụng cho sản phẩm đã chọn');
    }
    if (!voucher.stackableWithPromotion) {
      eligible = eligible.filter((l) => !l.hasPromotion);
      if (eligible.length === 0) {
        return fail('NOT_STACKABLE', 'Mã giảm giá không áp dụng cho sản phẩm đang khuyến mãi');
      }
    }
  }

  // Giá trị đơn tối thiểu tính trên cả đơn sau khuyến mãi, không chỉ các dòng đủ điều kiện.
  const orderValue = lines.reduce((total, l) => total + l.finalAmount, 0);
  if (voucher.minOrderValue != null && orderValue < voucher.minOrderValue) {
    return fail('MIN_ORDER_NOT_MET', `Cần thêm ${money(voucher.minOrderValue - orderValue)}`);
  }

  const rule: VoucherRule = {
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maxDiscountValue: voucher.maxDiscountValue,
    eligibleVariantIds: new Set(eligible.map((l) => l.variantId)),
  };
  const base = eligible.reduce((total, l) => total + l.finalAmount, 0);
  return { valid: true, discount: calcVoucherDiscount(rule, base), rule };
}

/**
 * Voucher cần báo cho khách (dải thông báo): voucher được tặng (chiến dịch giữ chân),
 * chưa dùng, còn hạn (`status` đã tính hạn) và khách chưa xem. Voucher bù giao trễ không tính.
 */
export function isNewGift(v: { source: string; status: string; seenAt: string | null }): boolean {
  return v.source === 'GIFTED' && v.status === 'UNUSED' && !v.seenAt;
}
