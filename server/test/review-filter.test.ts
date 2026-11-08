import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewViolation } from '../src/modules/reviews/review-filter.js';

test('đánh giá bình thường không bị chặn', () => {
  assert.equal(reviewViolation('Sofa đẹp, các chi tiết hoàn thiện tốt, giao nhanh.'), null);
  assert.equal(reviewViolation('Giá 15.725.000 đ, rất đáng tiền'), null);
});

test('chặn liên kết và số điện thoại', () => {
  assert.ok(reviewViolation('xem thêm tại https://abc.xyz'));
  assert.ok(reviewViolation('liên hệ shop shopxyz.vn'));
  assert.ok(reviewViolation('gọi 0901 234 567 nhé'));
  assert.ok(reviewViolation('zalo +84901234567'));
});

test('chặn từ cấm nguyên từ và spam', () => {
  assert.ok(reviewViolation('hàng như lừa đảo'));
  assert.ok(reviewViolation('vcl tệ quá'));
  assert.ok(reviewViolation('aaaaaaaaaaaa'));
  assert.ok(reviewViolation('mua mua mua mua mua mua'));
});
