import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import {
  articleStatus,
  checkCover,
  checkLists,
  checkPinLimit,
  checkPublishable,
  checkSchedule,
  nextArticleCode,
  sanitizeArticleHtml,
  slugify,
  type ArticleValues,
} from './article-admin.rules.js';

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};

const full: ArticleValues = {
  title: 'Mẹo bảo quản đồ gỗ nội thất',
  slug: 'meo-bao-quan-do-go',
  type: 'ARTICLE',
  category: 'Mẹo bảo quản',
  coverUrl: '/uploads/articles/a.jpg',
  summary: 'x'.repeat(60),
  content: 'y'.repeat(300),
  tags: [],
  relatedProductIds: [],
};

test('AC2: nội dung 150 ký tự → đăng bị E-MKT-016-01, nhưng bản nháp (không gọi checkPublishable) vẫn lưu được', () => {
  assert.equal(code(() => checkPublishable({ ...full, content: 'y'.repeat(150) })), 'E-MKT-016-01');
  assert.equal(code(() => checkPublishable(full)), null);
});

test('đăng thiếu ảnh bìa / chuyên mục / slug sai', () => {
  assert.equal(code(() => checkPublishable({ ...full, coverUrl: null })), 'E-MKT-016-03');
  assert.equal(code(() => checkPublishable({ ...full, category: null })), 'E-MKT-016-01');
  assert.equal(code(() => checkPublishable({ ...full, type: 'ANNOUNCEMENT', category: null })), null); // thông báo không cần chuyên mục
  assert.equal(code(() => checkPublishable({ ...full, slug: 'Sai Slug' })), 'E-MKT-016-02');
});

test('AC3: đã 3 thông báo ghim → ghim thêm bị E-MKT-016-04; bài viết thường không bị tính', () => {
  assert.equal(code(() => checkPinLimit(true, 'ANNOUNCEMENT', 3)), 'E-MKT-016-04');
  assert.equal(code(() => checkPinLimit(true, 'ANNOUNCEMENT', 2)), null);
  assert.equal(code(() => checkPinLimit(true, 'ARTICLE', 3)), null);
});

test('lên lịch phải sau hiện tại ≥ 5 phút; thẻ ≤ 10, sản phẩm ≤ 8', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  assert.equal(code(() => checkSchedule(new Date('2026-11-03T10:04:00Z'), now)), 'E-MKT-016-05');
  assert.equal(code(() => checkSchedule(null, now)), 'E-MKT-016-05');
  assert.equal(code(() => checkSchedule(new Date('2026-11-03T10:05:00Z'), now)), null);
  const tags = Array.from({ length: 11 }, (_, i) => `the${i}`);
  assert.equal(code(() => checkLists({ tags, relatedProductIds: [] })), 'E-MKT-016-06');
  assert.equal(code(() => checkLists({ tags: [], relatedProductIds: Array(9).fill('x') })), 'E-MKT-016-06');
  assert.equal(code(() => checkLists({ tags: ['a'], relatedProductIds: [] })), 'E-MKT-016-01');
});

test('trạng thái: đã đăng nhưng publishAt ở tương lai = Đã lên lịch', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  assert.equal(articleStatus({ state: 'PUBLISHED', publishAt: new Date('2026-11-04T00:00:00Z') }, now), 'SCHEDULED');
  assert.equal(articleStatus({ state: 'PUBLISHED', publishAt: new Date('2026-11-03T09:00:00Z') }, now), 'PUBLISHED');
  assert.equal(articleStatus({ state: 'HIDDEN', publishAt: new Date('2026-11-04T00:00:00Z') }, now), 'HIDDEN');
});

test('slug bỏ dấu, mã bài viết tăng dần, ảnh bìa tối thiểu 1200×630', () => {
  assert.equal(slugify('Mẹo bảo quản đồ gỗ – Đẹp!'), 'meo-bao-quan-do-go-dep');
  assert.equal(nextArticleCode(null), 'BV00001');
  assert.equal(nextArticleCode('BV00009'), 'BV00010');
  assert.equal(code(() => checkCover({ width: 1000, height: 630, bytes: 1 })), 'E-MKT-016-03');
  assert.equal(code(() => checkCover({ width: 1200, height: 630, bytes: 3 * 1024 * 1024 })), 'E-MKT-016-03');
  assert.equal(code(() => checkCover({ width: 1200, height: 630, bytes: 1000 })), null);
});

test('lọc HTML: bỏ script/onerror/javascript:, chỉ giữ iframe YouTube embed', () => {
  const out = sanitizeArticleHtml(
    '<p onclick="x()">Chào</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">a</a>' +
      '<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe><iframe src="https://evil.com/x"></iframe>',
  );
  assert.ok(!/script|onclick|onerror|javascript:|evil/.test(out), out);
  assert.ok(out.includes('youtube.com/embed/abcdefghijk'), out);
});
