import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import {
  buildPromotionIndex,
  discountFor,
  resolvePromotion,
} from '../promotions/promotion.service.js';
import type { PromotionDoc } from '../promotions/promotion.model.js';
import {
  checkDiscount,
  checkEdit,
  checkReason,
  checkTimes,
  checkTransition,
  findConflicts,
  hasHighDiscount,
  previewLine,
  promotionCode,
  type Occupant,
} from './promotion-admin.rules.js';

const now = new Date('2026-11-03T05:00:00Z');
const day = 86_400_000;
const code = (fn: () => unknown, expected: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === expected);

test('AC3 FR-004: 2.499.000 giảm 15% → 2.124.000 (làm tròn xuống nghìn)', () => {
  const rule = { discountType: 'PERCENT', discountValue: 15 } as const;
  assert.equal(2_499_000 - discountFor(2_499_000, rule), 2_124_000);
  assert.equal(previewLine(2_499_000, rule).finalPrice, 2_124_000);
});

test('giá sau giảm có sàn 1.000 và mức tối đa được áp dụng', () => {
  assert.equal(
    10_000 - discountFor(10_000, { discountType: 'FIXED_AMOUNT', discountValue: 9_999_000 }),
    1000,
  );
  const capped = { discountType: 'PERCENT', discountValue: 50, maxDiscountValue: 100_000 } as const;
  assert.equal(1_000_000 - discountFor(1_000_000, capped), 900_000);
  assert.equal(discountFor(1000, capped), 0);
});

test('AC4: giảm 60% cần xác nhận lần hai; 50% thì không', () => {
  const at = (pct: number) => [
    previewLine(1_000_000, { discountType: 'PERCENT', discountValue: pct }),
  ];
  assert.equal(hasHighDiscount(at(60)), true);
  assert.equal(hasHighDiscount(at(50)), false);
});

test('mức giảm: % ngoài 1–90, số tiền không nhỏ hơn giá thấp nhất (E-MKT-004-04)', () => {
  code(() => checkDiscount({ discountType: 'PERCENT', discountValue: 91 }, 1e6), 'E-MKT-004-04');
  code(
    () => checkDiscount({ discountType: 'FIXED_AMOUNT', discountValue: 500_000 }, 500_000),
    'E-MKT-004-04',
  );
  code(
    () => checkDiscount({ discountType: 'FIXED_AMOUNT', discountValue: 1500 }, 1e6),
    'E-MKT-004-04',
  );
  checkDiscount({ discountType: 'FIXED_AMOUNT', discountValue: 100_000 }, 500_000);
});

test('thời gian: quá khứ, dưới 1 giờ, trên 90 ngày; AC4 FR-005 (95 ngày)', () => {
  const start = new Date(now.getTime() + day);
  code(() => checkTimes(new Date(now.getTime() - day), start, now, true), 'E-MKT-004-02');
  code(() => checkTimes(start, new Date(start.getTime() + 1800_000), now, true), 'E-MKT-004-03');
  code(() => checkTimes(start, new Date(start.getTime() + 95 * day), now, true), 'E-MKT-004-03');
  checkTimes(start, new Date(start.getTime() + 90 * day), now, true);
  checkTimes(new Date(now.getTime() - day), new Date(now.getTime() + day), now, false);
});

const occ = (over: Partial<Occupant>): Occupant => ({
  id: 'o1',
  code: 'KM 261101-001',
  name: 'Tết',
  startDate: new Date(now.getTime() - day),
  endDate: new Date(now.getTime() + 10 * day),
  productIds: new Set(['A', 'B']),
  ...over,
});

test('AC2 FR-004: xung đột chỉ khi trùng sản phẩm và giao thời gian', () => {
  const start = now;
  const end = new Date(now.getTime() + 5 * day);
  assert.deepEqual([...findConflicts(['A', 'C'], [occ({})], start, end).keys()], ['A']);
  const after = occ({
    startDate: new Date(end.getTime() + day),
    endDate: new Date(end.getTime() + 2 * day),
  });
  assert.equal(findConflicts(['A'], [after], start, end).size, 0);
});

test('khóa trường theo trạng thái (E-MKT-005-01/02, AC2)', () => {
  checkEdit('DRAFT', ['scopeType', 'discountValue', 'startDate']);
  code(() => checkEdit('UPCOMING', ['scopeType']), 'E-MKT-005-01');
  checkEdit('UPCOMING', ['discountValue', 'startDate', 'productIds']);
  code(() => checkEdit('RUNNING', ['discountValue']), 'E-MKT-005-01');
  code(() => checkEdit('PAUSED', ['startDate']), 'E-MKT-005-01');
  checkEdit('RUNNING', ['endDate', 'name', 'productIds', 'excludedProductIds']);
  code(() => checkEdit('ENDED', ['name']), 'E-MKT-005-02');
});

const promo = (over: Partial<PromotionDoc>) =>
  ({
    state: 'ACTIVE',
    everRan: false,
    startDate: new Date(now.getTime() - day),
    endDate: new Date(now.getTime() + day),
    ...over,
  }) as PromotionDoc;

test('chuyển trạng thái: xóa, tạm dừng, tiếp tục (E-MKT-006-xx, E-COM-07)', () => {
  checkTransition('delete', promo({ state: 'DRAFT' }), 'DRAFT', now);
  code(() => checkTransition('delete', promo({}), 'RUNNING', now), 'E-MKT-006-01'); // AC4: đã chạy
  code(
    () =>
      checkTransition(
        'delete',
        promo({ everRan: true, startDate: new Date(now.getTime() + day) }),
        'UPCOMING',
        now,
      ),
    'E-MKT-006-01',
  );
  checkTransition('delete', promo({ startDate: new Date(now.getTime() + day) }), 'UPCOMING', now);
  checkTransition('pause', promo({}), 'RUNNING', now);
  code(() => checkTransition('pause', promo({}), 'PAUSED', now), 'E-COM-07');
  code(() => checkTransition('end', promo({}), 'UPCOMING', now), 'E-COM-07');
  code(
    () =>
      checkTransition(
        'resume',
        promo({ state: 'PAUSED', endDate: new Date(now.getTime() - 1000) }),
        'ENDED',
        now,
      ),
    'E-MKT-006-03',
  );
  checkTransition('resume', promo({ state: 'PAUSED' }), 'PAUSED', now);
});

test('lý do: ghi chú ≥ 10 ký tự khi "Khác" / "Sai cấu hình" (E-MKT-006-02)', () => {
  code(() => checkReason('OTHER'), 'E-MKT-006-02');
  code(() => checkReason('WRONG_CONFIG', 'ngắn'), 'E-MKT-006-02');
  checkReason('OUT_OF_BUDGET');
});

test('mã chương trình theo ngày giờ Việt Nam', () => {
  assert.equal(promotionCode(new Date('2026-11-03T18:00:00Z'), 7), 'KM 261104-007');
});

test('phía khách: sản phẩm bị loại trừ khỏi chương trình danh mục không được giảm', () => {
  const cat = new Types.ObjectId();
  const excluded = new Types.ObjectId();
  const other = new Types.ObjectId();
  const p = {
    _id: new Types.ObjectId(),
    discountType: 'PERCENT',
    discountValue: 10,
    excludedProductIds: [excluded],
    targets: [{ categoryId: cat }],
  } as unknown as PromotionDoc;
  const index = buildPromotionIndex([p]);
  assert.equal(resolvePromotion(excluded, [cat], index), null);
  assert.ok(resolvePromotion(other, [cat], index));
});
