import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderInvoicePdf, splitVat, type InvoicePdfData } from './invoice.pdf.js';

const sample = (over: Partial<InvoicePdfData> = {}): InvoicePdfData => ({
  invoiceNumber: 'HD-CV2611120001',
  symbol: '1C26TCV',
  issuedAt: new Date('2026-11-12T03:00:00Z'),
  orderCode: 'CV2611120001',
  seller: { name: 'CaraVeso', taxCode: '', address: '' },
  buyer: { type: 'NONE', recipientName: 'Nguyễn Văn A' },
  lines: [{ name: 'Vòi sen đen', details: '', quantity: 2, unitPrice: 350000 }],
  subtotal: 700000,
  promotionDiscount: 0,
  voucherDiscount: 0,
  shippingFee: 0,
  installationFee: 0,
  exchangeCredit: 0,
  totalAmount: 700000,
  vatRate: 0.1,
  ...over,
});

test('splitVat: tách thuế từ giá đã gồm VAT và cộng lại đúng tổng', () => {
  assert.deepEqual(splitVat(1100000, 0.1), { net: 1000000, vat: 100000 });
  const { net, vat } = splitVat(4250000, 0.1);
  assert.equal(net + vat, 4250000);
  assert.equal(vat, 386364);
  assert.deepEqual(splitVat(0, 0.1), { net: 0, vat: 0 });
});

test('renderInvoicePdf: trả về file PDF hợp lệ cho đơn lấy hóa đơn công ty', async () => {
  const pdf = await renderInvoicePdf(
    sample({
      buyer: { type: 'COMPANY', name: 'Công ty TNHH ABC', taxCode: '0312345678-001', address: '45 Nguyễn Huệ', recipientName: 'A' },
    }),
  );
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(pdf.length > 1000);
});

test('renderInvoicePdf: đơn có nhiều dòng hàng tự ngắt trang không lỗi', async () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({
    name: `Sản phẩm số ${i + 1} có tên khá dài để kiểm tra xuống dòng`,
    details: 'Màu kem · Đá nhân tạo Terrazzo · 170×80×55 cm',
    quantity: 1,
    unitPrice: 100000,
  }));
  const pdf = await renderInvoicePdf(sample({ lines, subtotal: 8000000, totalAmount: 8000000 }));
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
});
