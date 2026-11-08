import assert from 'node:assert/strict';
import test from 'node:test';
import { announcementStatus } from './announcement.model.js';

const now = new Date('2026-11-08T10:00:00Z');
const h = (n: number) => new Date(now.getTime() + n * 3600_000);

test('nháp và ẩn giữ nguyên trạng thái', () => {
  assert.equal(announcementStatus({ status: 'DRAFT', publishAt: h(-1), endAt: null }, now), 'DRAFT');
  assert.equal(announcementStatus({ status: 'HIDDEN', publishAt: h(-1), endAt: null }, now), 'HIDDEN');
});

test('đã đăng: lên lịch, đang hiển thị, đã kết thúc', () => {
  assert.equal(announcementStatus({ status: 'LIVE', publishAt: h(2), endAt: null }, now), 'SCHEDULED');
  assert.equal(announcementStatus({ status: 'LIVE', publishAt: h(-2), endAt: null }, now), 'ACTIVE');
  assert.equal(announcementStatus({ status: 'LIVE', publishAt: h(-2), endAt: h(1) }, now), 'ACTIVE');
  assert.equal(announcementStatus({ status: 'LIVE', publishAt: h(-2), endAt: h(-1) }, now), 'ENDED');
});
