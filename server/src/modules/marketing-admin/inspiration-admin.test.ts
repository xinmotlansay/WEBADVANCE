import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import { checkInspirationPublishable, inspirationSchema, updateInspirationSchema } from './inspiration-admin.rules.js';

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};
const id = (n: number) => `64b0000000000000000000${String(n).padStart(2, '0')}`;

test('schema: ảnh /uploads hoặc https, tối đa 12 sản phẩm', () => {
  assert.ok(inspirationSchema.safeParse({ imageUrl: '/uploads/inspirations/a.jpg', productIds: [id(1)] }).success);
  assert.ok(!inspirationSchema.safeParse({ imageUrl: 'javascript:alert(1)' }).success);
  assert.ok(!inspirationSchema.safeParse({ imageUrl: '/uploads/../x.jpg' }).success);
  const thirteen = Array.from({ length: 13 }, (_, i) => id(i + 1));
  assert.ok(!inspirationSchema.safeParse({ imageUrl: '/uploads/a.jpg', productIds: thirteen }).success);
  assert.ok(!updateInspirationSchema.safeParse({ imageUrl: '/uploads/a.jpg' }).success, 'sửa phải kèm version');
});

test('Hiện cần ≥ 1 sản phẩm → E-MKT-021-02', () => {
  assert.equal(code(() => checkInspirationPublishable(0)), 'E-MKT-021-02');
  assert.equal(code(() => checkInspirationPublishable(1)), null);
});
