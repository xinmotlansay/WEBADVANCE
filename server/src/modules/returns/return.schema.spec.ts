import { describe, expect, it } from 'vitest';
import { updateReturnSchema } from './return.schema.js';

describe('return update schema', () => {
  it('accepts a replacement SKU, quantity, and tracking code', () => {
    expect(
      updateReturnSchema.safeParse({
        replacement: {
          sku: '100.099.01',
          quantity: 1,
          trackingCode: 'GHN123456',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects invalid replacement quantity and empty identifiers', () => {
    expect(
      updateReturnSchema.safeParse({
        replacement: {
          sku: '100.099.01',
          quantity: 0,
          trackingCode: 'GHN123456',
        },
      }).success,
    ).toBe(false);
    expect(
      updateReturnSchema.safeParse({
        replacement: {
          sku: '',
          quantity: 1,
          trackingCode: 'GHN123456',
        },
      }).success,
    ).toBe(false);
  });
});
