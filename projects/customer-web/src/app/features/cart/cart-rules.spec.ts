// Chạy bằng `npm run test:web` (node:test qua tsx), không qua Angular.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cart, CartItem } from 'shared';
import { withQuantity } from './cart-rules';

const line = (id: string, quantity: number, isSelected: boolean): CartItem =>
  ({
    id,
    quantity,
    isSelected,
    pricing: {
      unitPrice: 1_000_000,
      promotionId: null,
      promotionDiscount: 100_000 * quantity,
      lineTotal: 1_000_000 * quantity,
    },
    shippingFee: 50_000 * quantity,
    installationFee: 20_000 * quantity,
  }) as CartItem;

const cart: Cart = {
  id: 'c1',
  appliedVoucher: null,
  items: [line('a', 2, true), line('b', 1, false)],
  summary: {
    subtotal: 2_000_000,
    promotionDiscount: 200_000,
    voucherDiscount: 0,
    shippingFee: 100_000,
    installationFee: 40_000,
    totalAmount: 1_940_000,
  },
};

test('đổi số lượng: tiền dòng và hóa đơn tính lại như server, dòng không chọn không cộng', () => {
  const next = withQuantity(cart, 'a', 3);
  assert.deepEqual(next.items[0], line('a', 3, true));
  assert.equal(next.items[1], cart.items[1]);
  assert.deepEqual(next.summary, {
    subtotal: 3_000_000,
    promotionDiscount: 300_000,
    voucherDiscount: 0,
    shippingFee: 150_000,
    installationFee: 60_000,
    totalAmount: 2_910_000,
  });
});
