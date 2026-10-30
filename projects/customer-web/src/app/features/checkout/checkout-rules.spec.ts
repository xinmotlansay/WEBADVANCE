// Chạy bằng `npm run test:web` (node:test qua tsx), không qua Angular.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPayment,
  formatDay,
  invoiceErrors,
  isPaymentAvailable,
  scheduleDates,
  toInvoiceInfo,
  toPaymentBody,
  type InvoiceForm,
} from './checkout-rules';

const quote = (depositRequired: boolean, methods: ('COD' | 'BANK_TRANSFER')[]) => ({
  methodsAvailable: methods,
  depositRequired,
  depositRate: 0.3,
  depositAmount: depositRequired ? 9_000_000 : 0,
  codAmountIfDeposit: depositRequired ? 21_000_000 : 0,
});

test('phương thức mặc định: COD dưới ngưỡng, cọc trên ngưỡng, COD bị khóa trên ngưỡng', () => {
  assert.equal(defaultPayment(quote(false, ['COD', 'BANK_TRANSFER'])), 'COD');
  assert.equal(defaultPayment(quote(true, ['BANK_TRANSFER'])), 'QR_DEPOSIT');
  assert.equal(defaultPayment(quote(false, ['BANK_TRANSFER'])), 'QR_FULL');
  assert.equal(isPaymentAvailable('COD', quote(true, ['BANK_TRANSFER'])), false);
  assert.equal(isPaymentAvailable('QR_DEPOSIT', quote(false, ['COD', 'BANK_TRANSFER'])), false);
  assert.deepEqual(toPaymentBody('QR_DEPOSIT'), {
    method: 'BANK_TRANSFER',
    collectionType: 'DEPOSIT',
  });
});

test('ngày hẹn bỏ Chủ nhật, định dạng có thứ', () => {
  // 28/10/2026 là Thứ Tư, 01/11 là Chủ nhật.
  assert.deepEqual(scheduleDates('2026-10-30', '2026-11-02'), [
    '2026-10-30',
    '2026-10-31',
    '2026-11-02',
  ]);
  assert.deepEqual(scheduleDates(null, null), []);
  assert.equal(formatDay('2026-10-28'), 'Thứ Tư, 28/10/2026');
});

const form = (over: Partial<InvoiceForm>): InvoiceForm => ({
  type: 'COMPANY',
  buyerName: 'Công ty ABC',
  taxCode: '0312345678',
  address: '45 Nguyễn Huệ',
  sendEmail: false,
  email: '',
  ...over,
});

test('hóa đơn: kiểm định dạng theo loại, bỏ field rỗng khi gửi', () => {
  assert.deepEqual(invoiceErrors(form({ type: 'NONE', buyerName: '' })), {});
  assert.deepEqual(invoiceErrors(form({})), {});
  assert.deepEqual(invoiceErrors(form({ taxCode: '0312345678-001' })), {});
  assert.ok(invoiceErrors(form({ taxCode: '123' })).taxCode);
  assert.deepEqual(invoiceErrors(form({ type: 'PERSONAL', taxCode: '' })), {});
  assert.ok(invoiceErrors(form({ type: 'PERSONAL', taxCode: '12345' })).taxCode);
  assert.ok(invoiceErrors(form({ sendEmail: true, email: 'abc' })).email);

  assert.deepEqual(toInvoiceInfo(form({ type: 'PERSONAL', taxCode: ' ', email: 'x@y.vn' })), {
    type: 'PERSONAL',
    buyerName: 'Công ty ABC',
    address: '45 Nguyễn Huệ',
    sendEmail: false,
  });
  assert.deepEqual(toInvoiceInfo(form({ type: 'NONE' })), { type: 'NONE' });
});
