import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changePercent, resolveRange, summarize, type OrderLite } from './dashboard.rules.js';

const now = new Date('2026-11-03T05:00:00Z'); // 12:00 ngày 03/11 giờ Việt Nam

const order = (id: string, over: Partial<OrderLite> = {}): OrderLite => ({
  id,
  userId: `u-${id}`,
  createdAt: new Date('2026-11-02T03:00:00Z'),
  status: 'DELIVERED',
  totalAmount: 1_000_000,
  shippingFee: 100_000,
  promotionDiscount: 0,
  voucherDiscount: 0,
  voucherId: null,
  items: [],
  ...over,
});
const code = (fn: () => unknown) =>
  assert.throws(fn, (e: { code?: string }) => e.code === 'E-MKT-002-01');

test('kỳ theo giờ Việt Nam: hôm nay, 7 ngày, tháng này, kỳ trước cùng độ dài', () => {
  const t = resolveRange('today', now);
  assert.equal(t.from.toISOString(), '2026-11-02T17:00:00.000Z');
  assert.equal(t.to.toISOString(), '2026-11-03T17:00:00.000Z');
  assert.equal(resolveRange('7d', now).from.toISOString(), '2026-10-27T17:00:00.000Z');
  assert.equal(resolveRange('month', now).from.toISOString(), '2026-10-31T17:00:00.000Z');
  const prev = resolveRange('30d', now);
  assert.equal(prev.prevTo.getTime(), prev.from.getTime());
  assert.equal(
    prev.to.getTime() - prev.from.getTime(),
    prev.from.getTime() - prev.prevFrom.getTime(),
  );
});

test('AC4: kỳ tùy chọn sai (từ > đến, tương lai, > 366 ngày, thiếu) bị từ chối', () => {
  code(() => resolveRange('custom', now, '2026-11-02', '2026-11-01'));
  code(() => resolveRange('custom', now, '2026-11-01', '2026-11-04'));
  code(() => resolveRange('custom', now, '2025-01-01', '2026-11-03'));
  code(() => resolveRange('custom', now, undefined, undefined));
  const ok = resolveRange('custom', now, '2026-11-01', '2026-11-03');
  assert.equal(ok.to.toISOString(), '2026-11-03T17:00:00.000Z');
  resolveRange('custom', now, '2025-11-03', '2026-11-03'); // đúng 366 ngày
});

test('AC5: mã có 10 đơn, 2 đơn hủy → lượt dùng 8, hoàn 2, tiền giảm chỉ tính 8 đơn', () => {
  const orders = Array.from({ length: 10 }, (_, i) =>
    order(`o${i}`, {
      voucherId: 'TET2027',
      voucherDiscount: 100_000,
      status: i < 2 ? 'CANCELLED' : 'DELIVERED',
    }),
  );
  const s = summarize(orders, new Map());
  const v = s.byVoucher.find((x) => x.id === 'TET2027')!;
  assert.equal(v.uses, 8);
  assert.equal(v.refunded, 2);
  assert.equal(v.discount, 800_000);
  assert.equal(s.voucherUses, 8);
  assert.equal(s.discountTotal, 800_000);
  assert.equal(s.cancelRate, 0.2);
});

test('AC6: đơn có cả chương trình và mã → mỗi nguồn ghi đúng số tiền của mình', () => {
  const o = order('a', {
    promotionDiscount: 200_000,
    voucherDiscount: 100_000,
    voucherId: 'V1',
    items: [{ promotionId: 'KM1', promotionDiscount: 200_000, quantity: 2 }],
  });
  const s = summarize([o], new Map());
  assert.equal(s.byPromotion[0].discount, 200_000);
  assert.equal(s.byPromotion[0].units, 2);
  assert.equal(s.byVoucher[0].discount, 100_000);
  assert.equal(s.offerOrders, 1);
  assert.equal(s.discountTotal, 300_000);
});

test('doanh thu không gồm phí ship, chỉ đơn hoàn thành; đơn đang giao không tính', () => {
  const orders = [
    order('a', { voucherId: 'V', voucherDiscount: 50_000 }),
    order('b', { voucherId: 'V', voucherDiscount: 50_000, status: 'SHIPPING' }),
  ];
  const s = summarize(orders, new Map());
  assert.equal(s.revenue, 900_000);
  assert.equal(s.doneOrders, 1);
  assert.equal(s.offerOrders, 2);
  assert.equal(s.costRatio, 50_000 / 900_000);
});

test('giá trị đơn trung bình có ưu đãi so với không ưu đãi; khách mới = đơn hoàn thành đầu tiên', () => {
  const orders = [
    order('a', { voucherId: 'V', voucherDiscount: 1, totalAmount: 2_100_000, userId: 'new' }),
    order('b', { voucherId: 'V', voucherDiscount: 1, totalAmount: 1_100_000, userId: 'old' }),
    order('c', { totalAmount: 600_000 }),
  ];
  const s = summarize(
    orders,
    new Map([
      ['new', 'a'],
      ['old', 'zzz'],
    ]),
  );
  assert.equal(s.byVoucher[0].newCustomers, 1);
  assert.equal(s.aovWithOffer, 1_500_000);
  assert.equal(s.aovWithoutOffer, 500_000);
});

test('theo ngày giờ Việt Nam: 18:00 UTC thuộc ngày hôm sau', () => {
  const o = order('a', { voucherId: 'V', createdAt: new Date('2026-11-02T18:00:00Z') });
  assert.equal(summarize([o], new Map()).daily[0].date, '2026-11-03');
});

test('thay đổi so với kỳ trước; kỳ trước bằng 0 thì không so sánh', () => {
  assert.equal(changePercent(150, 100), 50);
  assert.equal(changePercent(5, 0), null);
});
