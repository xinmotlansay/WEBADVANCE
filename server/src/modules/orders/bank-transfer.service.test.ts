import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyTransfer, extractTransferContent } from './bank-transfer.service.js';
import type { OrderDoc } from './order.model.js';

const dueAt = new Date('2026-10-17T10:15:00Z');
const before = new Date('2026-10-17T10:07:00Z');

const order = (over: Partial<OrderDoc> = {}, payment: Partial<OrderDoc['payment']> = {}) =>
  ({
    status: 'PENDING_PAYMENT',
    totalAmount: 30_000_000,
    payment: {
      method: 'BANK_TRANSFER',
      collectionType: 'FULL',
      status: 'PENDING',
      dueAt,
      ...payment,
    },
    ...over,
  }) as OrderDoc;

test('nội dung chuyển khoản: bỏ dấu gạch, chữ thường, có chữ chèn thêm', () => {
  assert.equal(extractTransferContent('CV261017-0001-K7Q2'), 'CV261017-0001-K7Q2');
  assert.equal(
    extractTransferContent('NGUYEN VAN A chuyen tien cv2610170001k7q2 FT123'),
    'CV261017-0001-K7Q2',
  );
  assert.equal(extractTransferContent('thanh toan don hang'), null);
});

test('đối chiếu: khớp, thiếu, thừa, sai nội dung', () => {
  assert.equal(classifyTransfer(order(), 30_000_000, before), 'MATCHED');
  assert.equal(classifyTransfer(order(), 29_999_000, before), 'UNDERPAID');
  assert.equal(classifyTransfer(order(), 30_001_000, before), 'OVERPAID');
  assert.equal(classifyTransfer(null, 30_000_000, before), 'WRONG_CONTENT');
});

test('đặt cọc so với tiền cọc, không so với tổng đơn', () => {
  const deposit = order({}, { collectionType: 'DEPOSIT', depositAmount: 9_000_000 });
  assert.equal(classifyTransfer(deposit, 9_000_000, before), 'MATCHED');
  assert.equal(classifyTransfer(deposit, 30_000_000, before), 'OVERPAID');
});

test('sau hạn hoặc đơn đã hủy là trễ; đơn đã nhận tiền thì là tiền thừa', () => {
  assert.equal(classifyTransfer(order(), 30_000_000, new Date('2026-10-17T10:16:00Z')), 'LATE');
  assert.equal(classifyTransfer(order({ status: 'CANCELLED' }), 30_000_000, before), 'LATE');
  assert.equal(
    classifyTransfer(order({ status: 'PENDING_CONFIRMATION' }), 30_000_000, before),
    'OVERPAID',
  );
});
