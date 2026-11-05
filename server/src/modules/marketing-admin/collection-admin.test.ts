import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import {
  checkDeletable,
  checkPublishable,
  createCollectionSchema,
  isValidCollectionSlug,
  normalizeProductIds,
} from './collection-admin.rules.js';

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};
const A = '64b000000000000000000001';
const B = '64b000000000000000000002';

test('slug: chữ thường không dấu, số, "-"; slug seed ngắn như "oda" hợp lệ', () => {
  assert.ok(isValidCollectionSlug('oda') && isValidCollectionSlug('phong-khach-2'));
  assert.ok(!isValidCollectionSlug('a') && !isValidCollectionSlug('Oda') && !isValidCollectionSlug('a--b') && !isValidCollectionSlug('-ab'));
});

test('schema: tên 2–120, mô tả ngắn ≤ 255, mô tả chi tiết ≤ 5000', () => {
  assert.ok(createCollectionSchema.safeParse({ name: 'ODA' }).success);
  assert.ok(!createCollectionSchema.safeParse({ name: 'O' }).success);
  assert.ok(!createCollectionSchema.safeParse({ name: 'ODA', shortDescription: 'x'.repeat(256) }).success);
  assert.ok(!createCollectionSchema.safeParse({ name: 'ODA', description: 'x'.repeat(5001) }).success);
});

test('sản phẩm: bỏ trùng giữ thứ tự, id sai → E-COM-01', () => {
  assert.deepEqual(normalizeProductIds([B, A, B]), [B, A]);
  assert.equal(code(() => normalizeProductIds(['abc'])), 'E-COM-01');
});

test('Hiện cần ≥ 1 ảnh và ≥ 1 sản phẩm (E-MKT-020-02)', () => {
  assert.equal(code(() => checkPublishable({ images: 0, products: 2 })), 'E-MKT-020-02');
  assert.equal(code(() => checkPublishable({ images: 1, products: 0 })), 'E-MKT-020-02');
  assert.equal(code(() => checkPublishable({ images: 1, products: 1 })), null);
});

test('xóa: phải ẩn trước (E-MKT-020-03)', () => {
  assert.equal(code(() => checkDeletable('VISIBLE')), 'E-MKT-020-03');
  assert.equal(code(() => checkDeletable('HIDDEN')), null);
});
