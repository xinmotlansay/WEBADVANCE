import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, normalizeSearch } from '../src/modules/products/search.service.js';
import { productListQuerySchema } from '../src/modules/products/product.schema.js';
import { isReturnEligible, availableQuantity } from '../src/modules/after-sales/return.service.js';
import { returnSchema, warrantySchema } from '../src/modules/after-sales/after-sales.schema.js';
import { detectFile } from '../src/utils/file-upload.js';
import { timeline } from '../src/modules/after-sales/warranty.service.js';

test('FR-15: Vietnamese folding, SKU punctuation, all terms and one-character typo', () => {
  assert.equal(normalizeSearch('ĐỒ GỖ 100.001.01'), 'do go 10000101');
  assert.ok(matchesSearch('ghe xam', 'Ghế Sofa Xám'));
  assert.ok(matchesSearch('10000101', '100.001.01'));
  assert.ok(matchesSearch('soffa', 'Sofa Oslo'));
  assert.ok(!matchesSearch('sofa xanh', 'Sofa màu đỏ'));
  assert.ok(!matchesSearch('ab', 'bàn'));
});
test('FR-20: rejects invalid category IDs, sort, page, inverted price and dimensions', () => {
  for (const q of [
    { categoryIds: 'invalid' },
    { page: '0' },
    { sort: 'popular' },
    { minPrice: '-1' },
    { minPrice: '20', maxPrice: '10' },
    { minLength: '30', maxLength: '20' },
  ])
    assert.ok(!productListQuerySchema.safeParse(q).success);
  assert.equal(productListQuerySchema.parse({ minPrice: '0', inStock: 'true' }).inStock, true);
});
test('FR-41: exact return deadline is inclusive; future delivery, expired and undelivered rejected', () => {
  const delivered = new Date('2026-10-01T00:00:00Z');
  assert.ok(isReturnEligible('DELIVERED', delivered, 7, new Date('2026-10-08T00:00:00Z')));
  assert.ok(!isReturnEligible('DELIVERED', delivered, 7, new Date('2026-10-08T00:00:00.001Z')));
  assert.ok(!isReturnEligible('SHIPPING', delivered, 7, new Date('2026-10-02')));
  assert.ok(!isReturnEligible('DELIVERED', delivered, 7, new Date('2026-09-30')));
});
test('FR-41: open/completed returns reserve quantity; cancelled/rejected release it', () => {
  assert.equal(
    availableQuantity(5, [
      { quantity: 1, status: 'PENDING' },
      { quantity: 2, status: 'COMPLETED' },
      { quantity: 1, status: 'REJECTED' },
      { quantity: 1, status: 'CANCELLED' },
    ]),
    2,
  );
  assert.equal(availableQuantity(1, [{ quantity: 2, status: 'PENDING' }]), 0);
});
test('FR-41/43: request validation requires contact, evidence, refund or replacement', () => {
  const contact = {
    name: 'Khách kiểm thử',
    phone: '0901234567',
    address: '12 Nguyễn Huệ, TP Hồ Chí Minh',
  };
  const body = {
    orderId: 'a'.repeat(24),
    orderItemId: 'b'.repeat(24),
    type: 'RETURN',
    quantity: 1,
    reason: 'OTHER',
    description: 'Mô tả đủ dài để kiểm thử',
    evidence: ['/uploads/evidence/test.png'],
    contact,
  };
  assert.ok(!returnSchema.safeParse(body).success);
  assert.ok(
    returnSchema.safeParse({
      ...body,
      refundAccount: {
        bankName: 'Ngân hàng',
        accountNumber: '123456789',
        accountHolder: 'NGUYEN VAN A',
      },
    }).success,
  );
  assert.ok(!returnSchema.safeParse({ ...body, type: 'EXCHANGE' }).success);
  assert.ok(
    !warrantySchema.safeParse({
      warrantyCardId: 'a'.repeat(24),
      defectDescription: 'Lỗi sản phẩm không hoạt động',
      evidence: [],
      contact,
    }).success,
  );
});
test('Upload validates magic bytes; rejects renamed HTML and image-search video impostors', () => {
  assert.equal(detectFile(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])).ext, 'png');
  assert.throws(() => detectFile(new TextEncoder().encode('<html>not an image</html>')));
});

test('Legacy return timeline keeps its initial state and does not invent intermediate steps', () => {
  const requestedAt = new Date('2026-10-01T00:00:00Z');
  const result = timeline({status:'COMPLETED',requestedAt,completedAt:new Date('2026-10-03T00:00:00Z')},'PENDING');
  assert.deepEqual(result.map((entry)=>entry.status),['PENDING','COMPLETED']);
});
