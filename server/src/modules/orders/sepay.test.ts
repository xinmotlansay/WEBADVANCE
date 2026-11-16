import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSepayDate, sepayToBankTransfer, sepayWebhookSchema } from './sepay.js';

const base = {
  id: 92704,
  transferType: 'in',
  transferAmount: 14_350_000,
  content: 'NGUYEN VAN A chuyen tien cv261017-0001-k7q2',
  transactionDate: '2026-10-17 10:07:30',
  accountNumber: '0123456789',
} as const;

test('giờ SePay (VN) đổi đúng sang UTC', () => {
  assert.equal(parseSepayDate('2026-10-17 10:07:30')?.toISOString(), '2026-10-17T03:07:30.000Z');
  assert.equal(parseSepayDate('không phải ngày'), null);
});

test('tiền vào được đổi thành sự kiện chuyển khoản', () => {
  const body = sepayWebhookSchema.parse(base);
  assert.deepEqual(sepayToBankTransfer(body), {
    transactionCode: 'SEPAY-92704',
    amount: 14_350_000,
    content: 'NGUYEN VAN A chuyen tien cv261017-0001-k7q2',
    transactionAt: new Date('2026-10-17T03:07:30.000Z'),
  });
});

test('tiền ra bị bỏ qua', () => {
  const body = sepayWebhookSchema.parse({ ...base, transferType: 'out' });
  assert.equal(sepayToBankTransfer(body), null);
});

test('thiếu nội dung thì dùng description, rồi chuỗi rỗng', () => {
  const fromDesc = sepayWebhookSchema.parse({ ...base, content: null, description: 'CV261017-0001-K7Q2' });
  assert.equal(sepayToBankTransfer(fromDesc)?.content, 'CV261017-0001-K7Q2');
  const empty = sepayWebhookSchema.parse({ ...base, content: null, description: null });
  assert.equal(sepayToBankTransfer(empty)?.content, '');
});

test('payload sai kiểu bị từ chối', () => {
  assert.equal(sepayWebhookSchema.safeParse({ ...base, transferType: 'sideways' }).success, false);
  assert.equal(sepayWebhookSchema.safeParse({ ...base, transferAmount: -1 }).success, false);
});
