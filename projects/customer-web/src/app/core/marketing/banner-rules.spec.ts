// Chạy bằng `npm run test:web` (node:test qua tsx), không qua Angular.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstTime, isExternal, shouldShowPopup } from './banner-rules';

test('firstTime: mỗi khóa chỉ trả true một lần', () => {
  const seen = new Set<string>();
  assert.equal(firstTime(seen, 'impression:a'), true);
  assert.equal(firstTime(seen, 'impression:a'), false);
  assert.equal(firstTime(seen, 'click:a'), true);
});

test('isExternal: http(s) là liên kết ngoài, đường dẫn nội bộ thì không', () => {
  assert.equal(isExternal('https://youtube.com/x'), true);
  assert.equal(isExternal('http://a.vn'), true);
  assert.equal(isExternal('/products/ghe'), false);
  assert.equal(isExternal(''), false);
});

test('shouldShowPopup theo tần suất', () => {
  const now = new Date('2026-11-05T10:00:00+07:00').getTime();
  const earlierToday = new Date('2026-11-05T01:00:00+07:00').getTime();
  const yesterday = new Date('2026-11-04T23:00:00+07:00').getTime();
  // Chưa từng hiện
  assert.equal(shouldShowPopup('ONCE', null, false, now), true);
  // ONCE: đã hiện là thôi
  assert.equal(shouldShowPopup('ONCE', yesterday, false, now), false);
  // DAILY: theo ngày giờ VN
  assert.equal(shouldShowPopup('DAILY', earlierToday, false, now), false);
  assert.equal(shouldShowPopup('DAILY', yesterday, false, now), true);
  // SESSION (và mặc định null): chỉ xét phiên
  assert.equal(shouldShowPopup('SESSION', yesterday, true, now), false);
  assert.equal(shouldShowPopup('SESSION', yesterday, false, now), true);
  assert.equal(shouldShowPopup(null, null, false, now), true);
});
