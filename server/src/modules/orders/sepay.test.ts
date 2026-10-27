import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTransferContent } from './bank-transfer.service.js';
import { fromSepay, sepayWebhookSchema } from './sepay.js';

const payload = {
  id: 92704,
  gateway: 'MBBank',
  transactionDate: '2026-10-27 14:02:37',
  accountNumber: '0123456789',
  code: null,
  content: 'NGUYEN VAN A chuyen tien CV2610270001K7Q2 FT26300123',
  transferType: 'in',
  transferAmount: 1450000,
  accumulated: 5000000,
  subAccount: '',
  referenceCode: 'FT26300123',
  description: '',
};

test('SePay tiền vào: đổi sang sự kiện chuyển khoản, giờ Việt Nam', () => {
  const event = fromSepay(sepayWebhookSchema.parse(payload));
  assert.deepEqual(event, {
    transactionCode: 'SEPAY-92704',
    amount: 1450000,
    content: payload.content,
    transactionAt: new Date('2026-10-27T07:02:37.000Z'),
  });
  assert.equal(extractTransferContent(event?.content ?? ''), 'CV261027-0001-K7Q2');
});

test('SePay tiền ra: bỏ qua', () => {
  assert.equal(fromSepay(sepayWebhookSchema.parse({ ...payload, transferType: 'out' })), null);
});

test('SePay payload sai định dạng ngày: không hợp lệ', () => {
  assert.equal(
    sepayWebhookSchema.safeParse({ ...payload, transactionDate: '27/10/2026' }).success,
    false,
  );
});
