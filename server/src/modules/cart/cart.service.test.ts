import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LineContext } from '../checkout/line-context.js';
import { isBlocking, lineWarnings } from './cart.service.js';

const ctx = (stockQuantity: number, over: Partial<LineContext> = {}): LineContext =>
  ({
    variant: { stockQuantity, lowStockThreshold: 5 },
    finalPrice: 1_000_000,
    unavailable: false,
    ...over,
  }) as LineContext;

test('cảnh báo tồn kho: còn hàng, sắp hết, vượt tồn, hết hàng', () => {
  assert.deepEqual(lineWarnings(ctx(25), 2, 1_000_000), []);
  assert.deepEqual(lineWarnings(ctx(3), 2, 1_000_000), ['LOW_STOCK']);
  assert.deepEqual(lineWarnings(ctx(3), 5, 1_000_000), ['EXCEEDS_STOCK']);
  assert.deepEqual(lineWarnings(ctx(0), 1, 1_000_000), ['OUT_OF_STOCK']);
});

test('giá hiện tại khác giá lúc thêm thì báo đổi giá', () => {
  assert.deepEqual(lineWarnings(ctx(25), 1, 1_200_000), ['PRICE_CHANGED']);
});

test('ngừng bán, hết hàng, vượt tồn chặn chọn; sắp hết và đổi giá thì không', () => {
  assert.equal(isBlocking(lineWarnings(ctx(25, { unavailable: true }), 1, 1_000_000)), true);
  assert.equal(isBlocking(lineWarnings(ctx(0), 1, 1_000_000)), true);
  assert.equal(isBlocking(lineWarnings(ctx(3), 4, 1_000_000)), true);
  assert.equal(isBlocking(lineWarnings(ctx(3), 3, 1_200_000)), false);
});
