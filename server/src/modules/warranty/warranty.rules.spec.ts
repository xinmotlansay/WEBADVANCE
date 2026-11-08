import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import { WarrantyStatus } from '../../lib/shared-enums.js';
import { assertWarrantyUpdateAllowed } from './warranty.rules.js';

describe('warranty status updates', () => {
  it('allows saving fields without changing the current in-warranty status', () => {
    expect(() =>
      assertWarrantyUpdateAllowed(WarrantyStatus.IN_WARRANTY, WarrantyStatus.IN_WARRANTY),
    ).not.toThrow();
  });

  it('keeps rejecting status changes that skip the warranty workflow', () => {
    expect(() =>
      assertWarrantyUpdateAllowed(WarrantyStatus.IN_WARRANTY, WarrantyStatus.INSPECTING),
    ).toThrowError(AppError);
  });
});
