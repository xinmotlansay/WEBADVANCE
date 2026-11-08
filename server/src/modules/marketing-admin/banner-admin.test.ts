import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import {
  checkBannerValues,
  checkCapacity,
  checkImage,
  createBannerSchema,
  ctr,
  isValidLink,
  nextBannerCode,
  sortBanners,
} from './banner-admin.rules.js';

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};
const img = (width: number, height: number, bytes = 100_000) => ({ width, height, bytes });

test('ảnh: AC3 1000×400 cho Slider bị từ chối; 1920×700 qua; sai tỉ lệ > 5% bị từ chối', () => {
  assert.equal(code(() => checkImage('desktop', 'HOME_SLIDER', img(1000, 400))), 'E-MKT-012-02');
  assert.equal(code(() => checkImage('desktop', 'HOME_SLIDER', img(1920, 700))), null);
  assert.equal(code(() => checkImage('desktop', 'HOME_SLIDER', img(1920, 900))), 'E-MKT-012-02'); // đủ lớn nhưng tỉ lệ lệch
  assert.equal(code(() => checkImage('desktop', 'POPUP', img(600, 600, 3 * 1024 * 1024))), 'E-MKT-012-02'); // > 2 MB
  assert.equal(code(() => checkImage('mobile', 'HOME_MIDDLE', img(750, 400, 2 * 1024 * 1024))), 'E-MKT-012-02'); // > 1 MB
  assert.equal(code(() => checkImage('mobile', 'HOME_MIDDLE', img(900, 500))), null); // ảnh mobile không ép tỉ lệ
});

test('liên kết: nội bộ "/" hoặc https, không "//" hay http', () => {
  assert.ok(isValidLink('/products/sofa') && isValidLink('https://a.vn/x'));
  assert.ok(!isValidLink('//evil.com') && !isValidLink('http://a.vn') && !isValidLink('javascript:alert(1)'));
  assert.equal(code(() => checkBannerValues({ position: 'HOME_SLIDER', linkUrl: 'abc' }, new Date())), 'E-MKT-012-03');
});

test('CTA cần liên kết; danh mục và popup cần trường riêng; kết thúc sau bắt đầu', () => {
  const now = new Date('2026-11-03T00:00:00Z');
  assert.equal(code(() => checkBannerValues({ position: 'HOME_SLIDER', ctaLabel: 'Mua ngay' }, now)), 'E-MKT-012-06');
  assert.equal(code(() => checkBannerValues({ position: 'CATEGORY' }, now)), 'E-MKT-012-01');
  assert.equal(code(() => checkBannerValues({ position: 'POPUP' }, now)), 'E-MKT-012-01');
  assert.equal(code(() => checkBannerValues({ position: 'HOME_SLIDER' }, now, new Date(now.getTime() - 1))), 'E-MKT-012-01');
  assert.equal(code(() => checkBannerValues({ position: 'POPUP', popupFrequency: 'DAILY' }, now)), null);
});

test('giới hạn số banner đang hiển thị (AC2): Slider 8, giữa 3, popup 1, danh mục không giới hạn', () => {
  assert.equal(code(() => checkCapacity('HOME_SLIDER', 8)), 'E-MKT-012-04');
  assert.equal(code(() => checkCapacity('HOME_SLIDER', 7)), null);
  assert.equal(code(() => checkCapacity('HOME_MIDDLE', 3)), 'E-MKT-012-04');
  assert.equal(code(() => checkCapacity('POPUP', 1)), 'E-MKT-012-04');
  assert.equal(code(() => checkCapacity('CATEGORY', 500)), null);
});

test('schema tạo: tiêu đề 5–100, thứ tự 1–99, ảnh phải nằm trong thư mục banner', () => {
  const ok = { position: 'HOME_SLIDER', title: 'Sale cuối năm', imageUrl: '/uploads/banners/a.jpg' };
  assert.ok(createBannerSchema.safeParse(ok).success);
  assert.ok(!createBannerSchema.safeParse({ ...ok, title: 'abc' }).success);
  assert.ok(!createBannerSchema.safeParse({ ...ok, displayOrder: 100 }).success);
  assert.ok(!createBannerSchema.safeParse({ ...ok, imageUrl: 'https://evil.com/x.jpg' }).success);
});

test('sắp xếp mặc định, CTR và mã BN', () => {
  const rows = sortBanners([
    { status: 'EXPIRED', displayOrder: 1 },
    { status: 'VISIBLE', displayOrder: 2 },
    { status: 'DRAFT', displayOrder: 1 },
    { status: 'VISIBLE', displayOrder: 1 },
    { status: 'SCHEDULED', displayOrder: 1 },
    { status: 'HIDDEN', displayOrder: 1 },
  ] as never[]) as { status: string; displayOrder: number }[];
  assert.deepEqual(
    rows.map((r) => r.status),
    ['VISIBLE', 'VISIBLE', 'SCHEDULED', 'HIDDEN', 'DRAFT', 'EXPIRED'],
  );
  assert.equal(rows[0]!.displayOrder, 1);
  assert.equal(ctr(200, 5), 0.025);
  assert.equal(ctr(0, 0), null);
  assert.equal(nextBannerCode(null), 'BN00001');
  assert.equal(nextBannerCode('BN00009'), 'BN00010');
});
