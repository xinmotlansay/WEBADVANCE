import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CHECKOUT_CONFIG } from '../config/config.service.js';
import {
  priceLines,
  quotePayment,
  resolveInstallation,
  resolvePayment,
  type PricingInput,
} from './pricing.js';

const { shipping, payment } = DEFAULT_CHECKOUT_CONFIG;

const line = (over: Partial<PricingInput>): PricingInput => ({
  variantId: 'v',
  quantity: 1,
  hasInstallation: false,
  unitPrice: 1_000_000,
  promotionId: null,
  unitPromotionDiscount: 0,
  shippingTier: 1,
  unitInstallationFee: 0,
  ...over,
});

test('phí vận chuyển, khuyến mãi và phí lắp đặt nhân theo số lượng', () => {
  const r = priceLines(
    [
      line({
        variantId: 'sofa',
        quantity: 2,
        unitPrice: 15_000_000,
        promotionId: 'p1',
        unitPromotionDiscount: 1_000_000,
        shippingTier: 3,
        hasInstallation: true,
        unitInstallationFee: 300_000,
      }),
      line({ variantId: 'ban', unitPrice: 3_500_000, shippingTier: 1 }),
    ],
    shipping,
    payment,
  );

  const [sofa, ban] = r.items;
  assert.deepEqual(sofa?.pricing, {
    unitPrice: 15_000_000,
    promotionId: 'p1',
    promotionDiscount: 2_000_000,
    lineTotal: 30_000_000,
  });
  assert.equal(sofa?.shippingFee, 500_000);
  assert.equal(sofa?.installationFee, 600_000);
  assert.equal(sofa?.finalAmount, 28_000_000);
  assert.equal(ban?.shippingFee, 30_000);

  assert.deepEqual(r.summary, {
    subtotal: 33_500_000,
    promotionDiscount: 2_000_000,
    voucherDiscount: 0,
    shippingFee: 530_000,
    installationFee: 600_000,
    totalAmount: 32_630_000,
  });
  assert.deepEqual(r.payment, {
    methodsAvailable: ['BANK_TRANSFER'],
    depositRequired: true,
    depositRate: 0.3,
    depositAmount: 9_789_000,
    codAmountIfDeposit: 22_841_000,
  });
});

test('không chọn lắp đặt thì không tính phí lắp đặt', () => {
  const r = priceLines(
    [line({ shippingTier: 3, hasInstallation: false, unitInstallationFee: 300_000 })],
    shipping,
    payment,
  );
  assert.equal(r.summary.installationFee, 0);
});

test('biến thể không có cấp vận chuyển hợp lệ thì báo lỗi', () => {
  assert.throws(() => priceLines([line({ shippingTier: 9 })], shipping, payment));
});

test('ngưỡng cọc: đúng 20.000.000đ chưa phải cọc, vượt 1đ thì phải cọc', () => {
  const atThreshold = quotePayment(20_000_000, payment);
  assert.equal(atThreshold.depositRequired, false);
  assert.deepEqual(atThreshold.methodsAvailable, ['COD', 'BANK_TRANSFER']);
  assert.equal(atThreshold.depositAmount, 0);

  const over = quotePayment(20_000_001, payment);
  assert.equal(over.depositRequired, true);
  assert.deepEqual(over.methodsAvailable, ['BANK_TRANSFER']);
  assert.equal(over.depositAmount + over.codAmountIfDeposit, 20_000_001);
});

test('tiền cọc là số nguyên VND, không lệch do số thực', () => {
  const q = quotePayment(30_680_000, payment);
  assert.equal(q.depositAmount, 9_204_000);
  assert.equal(q.codAmountIfDeposit, 21_476_000);
});

test('tắt COD trong cấu hình thì chỉ còn QR', () => {
  const q = quotePayment(1_000_000, { ...payment, codEnabled: false });
  assert.deepEqual(q.methodsAvailable, ['BANK_TRANSFER']);
});

test('lắp đặt theo installationService', () => {
  assert.equal(resolveInstallation('REQUIRED', false), true);
  assert.equal(resolveInstallation('NONE', true), false);
  assert.equal(resolveInstallation('OPTIONAL', true), true);
  assert.equal(resolveInstallation('OPTIONAL', false), false);
});

test('chọn phương thức: COD dưới ngưỡng, cọc hoặc QR toàn bộ trên ngưỡng', () => {
  const small = quotePayment(4_000_000, payment);
  assert.deepEqual(resolvePayment(4_000_000, small, { method: 'COD', collectionType: 'DEPOSIT' }), {
    method: 'COD',
    collectionType: 'FULL',
    amountDue: 0,
    depositAmount: 0,
    codAmount: 4_000_000,
  });
  assert.equal(
    resolvePayment(4_000_000, small, { method: 'BANK_TRANSFER', collectionType: 'FULL' }).amountDue,
    4_000_000,
  );
  assert.throws(
    () => resolvePayment(4_000_000, small, { method: 'BANK_TRANSFER', collectionType: 'DEPOSIT' }),
    { code: 'VALIDATION_ERROR' },
  );

  const big = quotePayment(30_000_000, payment);
  assert.throws(() => resolvePayment(30_000_000, big, { method: 'COD', collectionType: 'FULL' }), {
    code: 'DEPOSIT_REQUIRED',
  });
  const deposit = resolvePayment(30_000_000, big, {
    method: 'BANK_TRANSFER',
    collectionType: 'DEPOSIT',
  });
  assert.equal(deposit.amountDue, 9_000_000);
  assert.equal(deposit.codAmount, 21_000_000);
  assert.equal(
    resolvePayment(30_000_000, big, { method: 'BANK_TRANSFER', collectionType: 'FULL' }).amountDue,
    30_000_000,
  );
});

test('phương thức bị tắt trong cấu hình thì từ chối', () => {
  const quote = quotePayment(4_000_000, { ...payment, codEnabled: false });
  assert.throws(() => resolvePayment(4_000_000, quote, { method: 'COD', collectionType: 'FULL' }), {
    code: 'PAYMENT_METHOD_DISABLED',
  });
});
