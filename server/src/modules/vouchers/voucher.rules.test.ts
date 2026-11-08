import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import type { VoucherDoc } from './voucher.model.js';
import { checkVoucher, isNewGift, type VoucherContext, type VoucherLine } from './voucher.rules.js';

const now = new Date('2026-10-24T03:00:00Z');
const SOFA_CATEGORY = new Types.ObjectId();

const voucher = (over: Partial<VoucherDoc> = {}): VoucherDoc => ({
  _id: new Types.ObjectId(),
  code: 'TEST',
  type: 'PUBLIC',
  customerGroup: 'ALL',
  stackableWithPromotion: true,
  discountType: 'PERCENT',
  discountValue: 10,
  scope: [],
  perUserLimit: 1,
  usedCount: 0,
  startDate: new Date('2026-10-01T00:00:00Z'),
  endDate: new Date('2026-12-01T00:00:00Z'),
  status: 'ACTIVE',
  ...over,
});

const line = (over: Partial<VoucherLine> = {}): VoucherLine => ({
  variantId: 'v1',
  productId: 'p1',
  categoryIds: [],
  finalAmount: 10_000_000,
  hasPromotion: false,
  ...over,
});

const ctx = (over: Partial<VoucherContext> = {}): VoucherContext => ({
  now,
  lines: [line()],
  userUsedCount: 0,
  customerEligible: true,
  ...over,
});

const reasonOf = (v: VoucherDoc, c: VoucherContext): string | null => {
  const r = checkVoucher(v, c);
  return r.valid ? null : r.reason;
};

test('giảm theo phần trăm, chặn bởi mức giảm tối đa', () => {
  const r = checkVoucher(voucher({ maxDiscountValue: 500_000 }), ctx());
  assert.ok(r.valid);
  assert.equal(r.discount, 500_000);
  const uncapped = checkVoucher(voucher(), ctx());
  assert.ok(uncapped.valid);
  assert.equal(uncapped.discount, 1_000_000);
});

test('giảm số tiền cố định không vượt tiền hàng', () => {
  const r = checkVoucher(
    voucher({ discountType: 'FIXED_AMOUNT', discountValue: 300_000 }),
    ctx({ lines: [line({ finalAmount: 200_000 })] }),
  );
  assert.ok(r.valid);
  assert.equal(r.discount, 200_000);
});

test('trạng thái và thời hạn', () => {
  assert.equal(reasonOf(voucher({ status: 'PAUSED' }), ctx()), 'PAUSED');
  assert.equal(reasonOf(voucher({ status: 'EXPIRED' }), ctx()), 'EXPIRED');
  assert.equal(reasonOf(voucher({ endDate: new Date('2026-10-01T00:00:00Z') }), ctx()), 'EXPIRED');
  assert.equal(
    reasonOf(voucher({ startDate: new Date('2026-11-01T00:00:00Z') }), ctx()),
    'NOT_STARTED',
  );
});

test('giới hạn tổng lượt và lượt mỗi người', () => {
  assert.equal(
    reasonOf(voucher({ totalUsageLimit: 5, usedCount: 5 }), ctx()),
    'USAGE_LIMIT_REACHED',
  );
  assert.equal(reasonOf(voucher({ totalUsageLimit: 5, usedCount: 4 }), ctx()), null);
  assert.equal(
    reasonOf(voucher({ perUserLimit: 2 }), ctx({ userUsedCount: 2 })),
    'PER_USER_LIMIT_REACHED',
  );
  assert.equal(reasonOf(voucher({ perUserLimit: 2 }), ctx({ userUsedCount: 1 })), null);
});

test('nhóm khách không phù hợp', () => {
  assert.equal(
    reasonOf(voucher({ customerGroup: 'NEW_CUSTOMER' }), ctx({ customerEligible: false })),
    'CUSTOMER_GROUP_NOT_ELIGIBLE',
  );
});

test('giá trị đơn tối thiểu tính sau khuyến mãi, báo số tiền còn thiếu', () => {
  const v = voucher({ minOrderValue: 15_000_000 });
  const r = checkVoucher(v, ctx({ lines: [line({ finalAmount: 12_000_000 })] }));
  assert.ok(!r.valid);
  assert.equal(r.reason, 'MIN_ORDER_NOT_MET');
  assert.match(r.message, /3\.000\.000/);
  assert.equal(reasonOf(v, ctx({ lines: [line({ finalAmount: 15_000_000 })] })), null);
});

test('phạm vi theo danh mục hoặc sản phẩm; không có dòng phù hợp thì từ chối', () => {
  const v = voucher({ scope: [{ categoryId: SOFA_CATEGORY }] });
  const sofa = line({ variantId: 'sofa', categoryIds: [SOFA_CATEGORY.toString()] });
  const ban = line({ variantId: 'ban', finalAmount: 5_000_000 });

  assert.equal(reasonOf(v, ctx({ lines: [ban] })), 'SCOPE_NOT_MATCHED');
  const r = checkVoucher(v, ctx({ lines: [sofa, ban] }));
  assert.ok(r.valid);
  // Chỉ dòng sofa được giảm: 10% của 10 triệu.
  assert.equal(r.discount, 1_000_000);
  assert.deepEqual([...r.rule.eligibleVariantIds], ['sofa']);

  const byProduct = voucher({
    scope: [{ productId: new Types.ObjectId('0123456789abcdef01234567') }],
  });
  assert.equal(
    reasonOf(byProduct, ctx({ lines: [line({ productId: '0123456789abcdef01234567' })] })),
    null,
  );
});

test('voucher không cộng khuyến mãi bỏ qua dòng đang khuyến mãi', () => {
  const v = voucher({ stackableWithPromotion: false });
  const sale = line({ variantId: 'sale', hasPromotion: true });
  const full = line({ variantId: 'full', finalAmount: 4_000_000 });

  assert.equal(reasonOf(v, ctx({ lines: [sale] })), 'NOT_STACKABLE');
  const r = checkVoucher(v, ctx({ lines: [sale, full] }));
  assert.ok(r.valid);
  assert.equal(r.discount, 400_000);
  assert.deepEqual([...r.rule.eligibleVariantIds], ['full']);
});

test('giỏ chưa chọn dòng nào: hợp lệ với mức giảm 0 nếu không đòi giá trị tối thiểu', () => {
  const r = checkVoucher(voucher(), ctx({ lines: [] }));
  assert.ok(r.valid);
  assert.equal(r.discount, 0);
  assert.equal(reasonOf(voucher({ minOrderValue: 1 }), ctx({ lines: [] })), 'MIN_ORDER_NOT_MET');
});

test('voucher mới để báo khách: chỉ voucher tặng, chưa dùng, còn hạn, chưa xem', () => {
  const gift = { source: 'GIFTED', status: 'UNUSED', seenAt: null } as const;
  assert.equal(isNewGift(gift), true);
  assert.equal(isNewGift({ ...gift, seenAt: '2026-11-04T00:00:00.000Z' }), false);
  assert.equal(isNewGift({ ...gift, status: 'USED' }), false);
  // Hết hạn: listUserVouchers đã đổi trạng thái thành EXPIRED.
  assert.equal(isNewGift({ ...gift, status: 'EXPIRED' }), false);
  assert.equal(isNewGift({ ...gift, source: 'LATE_COMPENSATION' }), false);
  assert.equal(isNewGift({ ...gift, source: 'COLLECTED' }), false);
});
