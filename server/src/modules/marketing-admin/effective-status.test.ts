import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerStatus, promotionStatus, voucherStatus } from './effective-status.js';

const now = new Date('2026-11-03T05:00:00Z');
const past = new Date('2026-11-01T00:00:00Z');
const future = new Date('2026-11-10T00:00:00Z');
const running = { startDate: past, endDate: future };

test('khuyến mãi: trạng thái do người chọn kết hợp thời gian', () => {
  const p = (over: object) => promotionStatus({ status: 'RUNNING', ...running, ...over }, now);
  assert.equal(p({ state: 'DRAFT' }), 'DRAFT');
  assert.equal(p({ state: 'DRAFT', endDate: past }), 'DRAFT');
  assert.equal(p({ state: 'ACTIVE', startDate: future }), 'UPCOMING');
  assert.equal(p({ state: 'ACTIVE' }), 'RUNNING');
  assert.equal(p({ state: 'PAUSED' }), 'PAUSED');
  assert.equal(p({ state: 'PAUSED', endDate: past }), 'ENDED');
  assert.equal(p({ state: 'ENDED' }), 'ENDED');
  assert.equal(p({ state: 'ACTIVE', endDate: past }), 'ENDED');
});

test('khuyến mãi: dữ liệu cũ chưa có state suy từ status', () => {
  const p = (status: 'UPCOMING' | 'RUNNING' | 'ENDED' | 'PAUSED', over: object = {}) =>
    promotionStatus({ status, ...running, ...over }, now);
  assert.equal(p('RUNNING'), 'RUNNING');
  assert.equal(p('UPCOMING', { startDate: future }), 'UPCOMING');
  // status cũ ghi UPCOMING nhưng đã tới giờ: tự thành Đang diễn ra
  assert.equal(p('UPCOMING'), 'RUNNING');
  assert.equal(p('PAUSED'), 'PAUSED');
  assert.equal(p('ENDED'), 'ENDED');
});

test('mã giảm giá: vô hiệu hóa > hết hạn > sắp hiệu lực > hết lượt > đang hiệu lực', () => {
  const v = (over: object) =>
    voucherStatus(
      { status: 'ACTIVE', usedCount: 0, totalUsageLimit: 10, ...running, ...over },
      now,
    );
  assert.equal(v({}), 'ACTIVE');
  assert.equal(v({ startDate: future }), 'UPCOMING');
  assert.equal(v({ endDate: past }), 'EXPIRED');
  assert.equal(v({ status: 'EXPIRED' }), 'EXPIRED');
  assert.equal(v({ usedCount: 10 }), 'USED_UP');
  assert.equal(v({ usedCount: 10, totalUsageLimit: null }), 'ACTIVE');
  assert.equal(v({ usedCount: 10, endDate: past }), 'EXPIRED');
  assert.equal(v({ disabledAt: past, endDate: past }), 'DISABLED');
  assert.equal(v({ status: 'PAUSED' }), 'DISABLED');
});

test('banner: nháp, lên lịch, hiển thị, tạm ẩn, hết hạn; kết thúc trống là không giới hạn', () => {
  const b = (over: object) => bannerStatus({ status: 'VISIBLE', ...running, ...over }, now);
  assert.equal(b({ status: 'DRAFT', endDate: past }), 'DRAFT');
  assert.equal(b({}), 'VISIBLE');
  assert.equal(b({ endDate: null }), 'VISIBLE');
  assert.equal(b({ startDate: future }), 'SCHEDULED');
  assert.equal(b({ status: 'HIDDEN' }), 'HIDDEN');
  assert.equal(b({ status: 'HIDDEN', endDate: past }), 'EXPIRED');
  assert.equal(b({ endDate: past }), 'EXPIRED');
});
