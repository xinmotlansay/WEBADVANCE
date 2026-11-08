import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPublishAt, MIN_LEAD_MS } from './schedule.service.js';

const now = new Date('2026-11-08T10:00:00Z');

test('không có giờ hẹn thì đăng ngay', () => {
  assert.equal(checkPublishAt(undefined, now), undefined);
});

test('giờ hẹn phải sau hiện tại ít nhất 5 phút', () => {
  assert.throws(() => checkPublishAt(new Date(now.getTime() + MIN_LEAD_MS - 1000).toISOString(), now), /5 phút/);
  const ok = new Date(now.getTime() + MIN_LEAD_MS).toISOString();
  assert.equal(checkPublishAt(ok, now)?.toISOString(), ok);
});
