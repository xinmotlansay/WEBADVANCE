import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CHECKOUT_CONFIG } from '../config/config.service.js';
import {
  addWorkingDays,
  estimateDeliveryDate,
  isValidSchedule,
  quoteDelivery,
  vnToday,
} from './delivery.js';

const { shipping } = DEFAULT_CHECKOUT_CONFIG;
// Thứ Tư 21/10/2026, 10h sáng giờ Việt Nam.
const WEDNESDAY = new Date('2026-10-21T03:00:00Z');

test('ngày hiện tại tính theo giờ Việt Nam', () => {
  assert.equal(vnToday(new Date('2026-10-20T16:59:00Z')), '2026-10-20');
  assert.equal(vnToday(new Date('2026-10-20T17:00:00Z')), '2026-10-21');
});

test('ngày làm việc bỏ qua Chủ nhật', () => {
  assert.equal(addWorkingDays('2026-10-21', 3), '2026-10-24'); // T5, T6, T7
  assert.equal(addWorkingDays('2026-10-21', 5), '2026-10-27'); // bỏ CN 25/10
  assert.equal(addWorkingDays('2026-10-24', 1), '2026-10-26'); // T7 + 1 = T2
});

test('ngày giao dự kiến theo cấp cao nhất trong đơn', () => {
  assert.equal(estimateDeliveryDate([1, 2], shipping, WEDNESDAY), '2026-10-24');
  assert.equal(estimateDeliveryDate([1, 3], shipping, WEDNESDAY), '2026-10-27');
});

test('đơn chỉ có hàng cấp 1–2 không được hẹn lịch', () => {
  const q = quoteDelivery([1, 2], shipping, WEDNESDAY);
  assert.equal(q.schedulable, false);
  assert.equal(q.minScheduleDate, null);
  assert.deepEqual(q.slots, []);
  assert.equal(
    isValidSchedule({ scheduledDate: '2026-10-26', scheduledSlot: 'MORNING' }, q),
    false,
  );
});

test('khoảng hẹn lịch: từ ngày dự kiến đến +7 ngày, trừ Chủ nhật', () => {
  const q = quoteDelivery([2, 4], shipping, WEDNESDAY);
  assert.equal(q.schedulable, true);
  assert.equal(q.minScheduleDate, '2026-10-27');
  assert.equal(q.maxScheduleDate, '2026-11-03');

  const ok = (scheduledDate: string): boolean =>
    isValidSchedule({ scheduledDate, scheduledSlot: 'AFTERNOON' }, q);
  assert.equal(ok('2026-10-27'), true);
  assert.equal(ok('2026-11-03'), true);
  assert.equal(ok('2026-10-26'), false); // trước ngày dự kiến
  assert.equal(ok('2026-11-04'), false); // quá 7 ngày
  assert.equal(ok('2026-11-01'), false); // Chủ nhật
});
