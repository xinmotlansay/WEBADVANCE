import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import {
  checkCollectionImage,
  checkDeletable,
  checkPublishable,
  createCollectionSchema,
  isValidCollectionSlug,
  normalizeImages,
  normalizeProductIds,
  updateCollectionSchema,
  withHotspotProducts,
  type ImageInput,
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

const img = (over: Partial<ImageInput> = {}): ImageInput => ({
  url: '/uploads/collections/a.webp',
  title: '',
  description: '',
  isThumbnail: false,
  hotspots: [],
  ...over,
});

test('ảnh upload: ≤ 3 MB, cạnh ngắn ≥ 800 (E-MKT-020-04)', () => {
  assert.equal(code(() => checkCollectionImage({ width: 1600, height: 800, bytes: 1_000_000 })), null);
  assert.equal(code(() => checkCollectionImage({ width: 1600, height: 799, bytes: 1_000_000 })), 'E-MKT-020-04');
  assert.equal(code(() => checkCollectionImage({ width: 1600, height: 900, bytes: 3 * 1024 * 1024 + 1 })), 'E-MKT-020-04');
});

test('schema ảnh: x,y ∈ [0,1]; url nội bộ /uploads/ hoặc https; tối đa 10 ảnh, 8 hotspot/ảnh', () => {
  const ok = (images: unknown) => updateCollectionSchema.safeParse({ name: 'ODA', version: 0, images }).success;
  assert.ok(ok([img({ url: 'https://images.unsplash.com/x.jpg', hotspots: [{ productId: A, x: 0, y: 1 }] })]));
  assert.ok(!ok([img({ hotspots: [{ productId: A, x: 1.1, y: 0.5 }] })]));
  assert.ok(!ok([img({ url: 'javascript:alert(1)' })]) && !ok([img({ url: '//evil.com/a.jpg' })]) && !ok([img({ url: '/uploads/../.env' })]));
  assert.ok(!ok(Array.from({ length: 11 }, () => img())));
  assert.ok(!ok([img({ hotspots: Array.from({ length: 9 }, () => ({ productId: A, x: 0.5, y: 0.5 })) })]));
});

test('chuẩn hóa ảnh: đúng 1 ảnh đại diện (không chọn → ảnh đầu, chọn nhiều → giữ cái đầu), displayOrder theo vị trí', () => {
  const none = normalizeImages([img(), img()]);
  assert.deepEqual(none.map((i) => [i.isThumbnail, i.displayOrder]), [[true, 1], [false, 2]]);
  const many = normalizeImages([img(), img({ isThumbnail: true }), img({ isThumbnail: true })]);
  assert.deepEqual(many.map((i) => i.isThumbnail), [false, true, false]);
});

test('sản phẩm của hotspot chưa có trong danh sách được thêm vào cuối, không trùng', () => {
  const images = [img({ hotspots: [{ productId: B, x: 0.1, y: 0.1 }, { productId: A, x: 0.2, y: 0.2 }] })];
  assert.deepEqual(withHotspotProducts([A], images), [A, B]);
});
