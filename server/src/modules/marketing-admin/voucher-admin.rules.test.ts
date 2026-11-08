import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';
import type { VoucherDoc } from '../vouchers/voucher.model.js';
import {
  checkDisableNote,
  checkEdit,
  checkVoucherValues,
  createVoucherSchema,
  isLargeVoucher,
  resolveStart,
  warnFlags,
  withDefaults,
} from './voucher-admin.rules.js';

const now = new Date('2026-11-03T05:00:00Z');
const day = 86_400_000;

const input = (over: object = {}) =>
  withDefaults(
    createVoucherSchema.parse({
      code: 'tet2027',
      name: 'Tết 2027',
      description: 'Giảm 10% tối đa 500K cho đơn từ 3 triệu',
      discountType: 'PERCENT',
      discountValue: 10,
      maxDiscountValue: 500_000,
      minOrderValue: 3_000_000,
      totalUsageLimit: 100,
      perUserLimit: 1,
      endDate: new Date(now.getTime() + 30 * day),
      ...over,
    }),
  );
const values = (over: object = {}) => ({ ...input(over), startDate: now });
const throwsCode = (fn: () => unknown, expected: string) =>
  assert.throws(fn, (e: { code?: string }) => e.code === expected);

test('AC1: mã chuyển in hoa; mã sai định dạng bị từ chối', () => {
  assert.equal(input().code, 'TET2027');
  assert.equal(createVoucherSchema.safeParse({ ...input(), code: 'a b' }).success, false);
  assert.equal(createVoucherSchema.safeParse({ ...input(), code: 'abc' }).success, false);
});

test('AC3: số tiền cố định 500k với đơn tối thiểu 400k bị từ chối (E-MKT-008-04)', () => {
  const fixed = { discountType: 'FIXED_AMOUNT', discountValue: 500_000, maxDiscountValue: null };
  throwsCode(
    () => checkVoucherValues(values({ ...fixed, minOrderValue: 400_000 })),
    'E-MKT-008-04',
  );
  checkVoucherValues(values({ ...fixed, minOrderValue: 600_000 }));
});

test('giá trị giảm: % ngoài 1–90, thiếu mức tối đa, không bội 1.000', () => {
  throwsCode(() => checkVoucherValues(values({ discountValue: 91 })), 'E-MKT-008-04');
  throwsCode(() => checkVoucherValues(values({ maxDiscountValue: null })), 'E-MKT-008-04');
  throwsCode(() => checkVoucherValues(values({ maxDiscountValue: 1500 })), 'E-MKT-008-04');
});

test('lượt/khách > tổng lượt (E-MKT-008-05); thời hạn > 365 ngày (E-MKT-008-06)', () => {
  throwsCode(
    () => checkVoucherValues(values({ totalUsageLimit: 1, perUserLimit: 2 })),
    'E-MKT-008-05',
  );
  const far = new Date(now.getTime() + 366 * day);
  throwsCode(() => checkVoucherValues(values({ endDate: far })), 'E-MKT-008-06');
});

test('phạm vi: mục rỗng/đủ cả hai trường bị từ chối (E-MKT-008-07)', () => {
  throwsCode(() => checkVoucherValues(values({ scope: [{}] })), 'E-MKT-008-07');
  checkVoucherValues(values({ scope: [{ categoryId: 'a' }] }));
});

test('bắt đầu: "ngay" hoặc không ở quá khứ', () => {
  assert.equal(resolveStart({ startNow: true }, now), now);
  throwsCode(
    () => resolveStart({ startNow: false, startDate: new Date(now.getTime() - day) }, now),
    'E-MKT-008-06',
  );
  throwsCode(() => resolveStart({ startNow: false }, now), 'E-MKT-008-01');
});

test('mã lớn cần xác nhận: giảm > 1 triệu hoặc > 10.000 lượt', () => {
  assert.equal(isLargeVoucher(input()), false);
  assert.equal(isLargeVoucher(input({ maxDiscountValue: 1_500_000 })), true);
  assert.equal(isLargeVoucher(input({ totalUsageLimit: 10_001 })), true);
});

const voucher = (over: Partial<VoucherDoc> = {}): VoucherDoc => ({
  _id: new Types.ObjectId(),
  code: 'TET2027',
  name: 'Tết 2027',
  type: 'PUBLIC',
  customerGroup: 'ALL',
  stackableWithPromotion: true,
  discountType: 'PERCENT',
  discountValue: 10,
  maxDiscountValue: 500_000,
  minOrderValue: 3_000_000,
  scope: [],
  totalUsageLimit: 100,
  perUserLimit: 2,
  usedCount: 0,
  startDate: new Date(now.getTime() - day),
  endDate: new Date(now.getTime() + 10 * day),
  status: 'ACTIVE',
  ...over,
});

test('sửa: chưa dùng thì đổi được loại giảm; đã dùng thì khóa (E-MKT-009-01)', () => {
  assert.deepEqual(checkEdit(voucher(), { discountType: 'FIXED_AMOUNT' }, now).changed, [
    'discountType',
  ]);
  throwsCode(
    () => checkEdit(voucher({ usedCount: 5 }), { discountType: 'FIXED_AMOUNT' }, now),
    'E-MKT-009-01',
  );
  throwsCode(
    () => checkEdit(voucher({ usedCount: 5 }), { customerGroup: 'NEW_CUSTOMER' }, now),
    'E-MKT-009-01',
  );
});

test('AC2: tổng lượt < đã dùng (E-MKT-009-02); lượt/khách chỉ tăng (E-MKT-009-03)', () => {
  const used = voucher({ usedCount: 80 });
  throwsCode(() => checkEdit(used, { totalUsageLimit: 50 }, now), 'E-MKT-009-02');
  throwsCode(() => checkEdit(used, { perUserLimit: 1 }, now), 'E-MKT-009-03');
  assert.deepEqual(checkEdit(used, { perUserLimit: 3 }, now).changed, ['perUserLimit']);
});

test('đổi giá trị giảm khi đã dùng cần xác nhận; giá trị không đổi thì không tính là đổi', () => {
  const used = voucher({ usedCount: 5 });
  assert.equal(checkEdit(used, { discountValue: 15 }, now).needsConfirm, true);
  assert.deepEqual(checkEdit(used, { discountValue: 10, perUserLimit: 2 }, now).changed, []);
});

test('mã hết hạn / vô hiệu hóa chỉ sửa tên, mô tả (E-MKT-009-04)', () => {
  const expired = voucher({ endDate: new Date(now.getTime() - day) });
  throwsCode(() => checkEdit(expired, { totalUsageLimit: 200 }, now), 'E-MKT-009-04');
  checkEdit(expired, { name: 'Tên mới đây' }, now);
  throwsCode(
    () => checkEdit(voucher({ disabledAt: now }), { endDate: new Date() }, now),
    'E-MKT-009-04',
  );
});

test('mã không được đổi (E-MKT-009-01)', () => {
  throwsCode(() => checkEdit(voucher(), { code: 'KHAC1234' }, now), 'E-MKT-009-01');
});

test('vô hiệu hóa: ghi chú bắt buộc khi "Khác" hoặc "Bị lộ" (E-MKT-010-01)', () => {
  throwsCode(() => checkDisableNote('OTHER'), 'E-MKT-010-01');
  throwsCode(() => checkDisableNote('LEAKED_OR_ABUSED', 'ngắn'), 'E-MKT-010-01');
  checkDisableNote('WRONG_CONFIG');
  checkDisableNote('OTHER', 'ghi chú đủ dài rồi');
});

test('AC1 FR-007: dùng 45/50 có cờ NEAR_LIMIT; còn < 24 giờ có ENDING_SOON; mã không hoạt động thì không cờ', () => {
  const v = {
    usedCount: 45,
    totalUsageLimit: 50,
    endDate: new Date(now.getTime() + 2 * 3_600_000),
  };
  assert.deepEqual(warnFlags(v, 'ACTIVE', now), ['NEAR_LIMIT', 'ENDING_SOON']);
  assert.deepEqual(warnFlags(v, 'EXPIRED', now), []);
  assert.deepEqual(
    warnFlags({ ...v, usedCount: 10, endDate: new Date(now.getTime() + 5 * day) }, 'ACTIVE', now),
    [],
  );
});
