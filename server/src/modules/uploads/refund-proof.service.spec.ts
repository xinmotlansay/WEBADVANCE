import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import { MAX_REFUND_PROOF_BYTES, validateRefundProof } from './refund-proof.service.js';

describe('refund proof uploads', () => {
  it('accepts supported files when the declared type matches the file signature', () => {
    expect(validateRefundProof(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(
      'image/jpeg',
    );
    expect(validateRefundProof(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(
      'image/png',
    );
    expect(validateRefundProof(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe('application/pdf');
  });

  it('rejects unsupported, mismatched, and oversized file content', () => {
    expect(() => validateRefundProof(Buffer.from('nope'), 'text/plain')).toThrowError(AppError);
    expect(() => validateRefundProof(Buffer.from('not a pdf'), 'application/pdf')).toThrowError(
      AppError,
    );
    expect(() =>
      validateRefundProof(Buffer.alloc(MAX_REFUND_PROOF_BYTES + 1), 'image/jpeg'),
    ).toThrowError(AppError);
  });
});
