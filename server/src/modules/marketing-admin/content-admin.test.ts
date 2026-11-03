import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppError } from '../../utils/app-error.js';
import type { BarData, HomeData } from '../content/content.model.js';
import {
  barVisible,
  checkPublishable,
  checkSchedule,
  cleanText,
  defaultData,
  effectivePublished,
  emptyBlock,
  featuredVisible,
  normalizeHome,
} from './content-admin.rules.js';

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return null;
};

const featured = (over: object = {}): HomeData => ({
  blocks: [{ ...emptyBlock('FEATURED_PRODUCTS'), enabled: true, title: 'Nổi bật', productIds: ['a', 'b', 'c', 'd'], ...over }],
});

test('khối nổi bật cần 4–12 sản phẩm đang kinh doanh (E-MKT-015-03)', () => {
  assert.equal(code(() => checkPublishable('HOME', featured(), 4)), null);
  assert.equal(code(() => checkPublishable('HOME', featured(), 3)), 'E-MKT-015-03');
  assert.equal(code(() => checkPublishable('HOME', featured({ productIds: Array(13).fill('x') }), 13)), 'E-MKT-015-03');
});

test('khối tắt không bị kiểm; khối bật cần tiêu đề 2–80 và ảnh có alt 5–100', () => {
  assert.equal(code(() => checkPublishable('HOME', defaultData('HOME'))), null);
  assert.equal(code(() => checkPublishable('HOME', { blocks: [{ ...emptyBlock('BRAND_INTRO'), enabled: true, title: 'A' }] })), 'E-MKT-015-01');
  const withImg = { ...emptyBlock('BRAND_INTRO'), enabled: true, title: 'Về CaraVeso', imageUrl: '/uploads/content/a.jpg' };
  assert.equal(code(() => checkPublishable('HOME', { blocks: [withImg] })), 'E-MKT-015-01');
  assert.equal(code(() => checkPublishable('HOME', { blocks: [{ ...withImg, imageAlt: 'Phòng khách ấm cúng' }] })), null);
});

test('thanh thông báo: bật thì cần 5–120 ký tự; hiển thị theo khoảng thời gian (AC2)', () => {
  const bar: BarData = { enabled: true, text: 'Giảm 20%', linkUrl: '', startAt: '2026-11-01T00:00:00Z', endAt: '' };
  assert.equal(code(() => checkPublishable('ANNOUNCEMENT_BAR', { ...bar, text: 'abc' })), 'E-MKT-015-01');
  assert.equal(code(() => checkPublishable('ANNOUNCEMENT_BAR', { ...bar, linkUrl: 'javascript:x' })), 'E-MKT-015-01');
  assert.equal(code(() => checkPublishable('ANNOUNCEMENT_BAR', bar)), null);
  assert.equal(barVisible(bar, new Date('2026-10-31T23:59:00Z')), false);
  assert.equal(barVisible(bar, new Date('2026-11-01T00:00:00Z')), true);
  assert.equal(barVisible({ ...bar, enabled: false }, new Date('2026-11-02T00:00:00Z')), false);
});

test('bản hẹn giờ có hiệu lực khi đến giờ, trước đó vẫn là bản đã đăng', () => {
  const old = { enabled: true, text: 'cũ cũ cũ', linkUrl: '', startAt: '', endAt: '' };
  const next = { ...old, text: 'mới mới mới' };
  const doc = { published: old, scheduled: { data: next, publishAt: new Date('2026-11-01T00:00:00Z') } };
  assert.equal((effectivePublished(doc, new Date('2026-10-31T00:00:00Z')) as BarData).text, 'cũ cũ cũ');
  assert.equal((effectivePublished(doc, new Date('2026-11-01T00:00:01Z')) as BarData).text, 'mới mới mới');
  assert.equal(effectivePublished(null), null);
});

test('lên lịch cách hiện tại ≥ 5 phút; khối nổi bật < 4 sản phẩm tự ẩn', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  assert.equal(code(() => checkSchedule(new Date('2026-11-03T10:04:00Z'), now)), 'E-MKT-015-04');
  assert.equal(code(() => checkSchedule(new Date('2026-11-03T10:05:00Z'), now)), null);
  assert.equal(featuredVisible(3), false); // AC4: 4 sản phẩm, 1 ngừng kinh doanh
  assert.equal(featuredVisible(4), true);
});

test('HTML trong văn bản bị bỏ kèm cảnh báo E-MKT-015-05; trang chủ luôn đủ 5 khối', () => {
  const r = cleanText('ANNOUNCEMENT_BAR', { enabled: true, text: 'Sale <script>x</script>lớn', linkUrl: '', startAt: '', endAt: '' });
  assert.ok(!(r.data as BarData).text.includes('<'));
  assert.ok(r.warning);
  assert.equal(cleanText('ANNOUNCEMENT_BAR', defaultData('ANNOUNCEMENT_BAR')).warning, null);
  assert.equal(normalizeHome({ blocks: [emptyBlock('PROMOTION'), emptyBlock('PROMOTION')] }).blocks.length, 5);
});
