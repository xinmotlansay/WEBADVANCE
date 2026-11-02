import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import {
  ReconciliationStatus,
  RefundStatus,
  TransactionType,
} from '../../lib/shared-enums.js';
import {
  assertResolvable,
  assertResolutionNote,
  expectedAmountOf,
  isCollectionTransaction,
  isException,
  resolveOutcome,
} from './payment.rules.js';
import type { PaymentTransactionDoc } from './payment.model.js';

function txn(status: ReconciliationStatus): PaymentTransactionDoc {
  return {
    _id: 'x',
    type: TransactionType.FULL_PAYMENT,
    amount: 1_000,
    recordSource: 'AUTO',
    reconciliationStatus: status,
    status: RefundStatus.COMPLETED,
    transactionAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as PaymentTransactionDoc;
}

describe('payment reconciliation rules', () => {
  it('coi 4 trạng thái là ngoại lệ cần đối soát', () => {
    expect(isException(ReconciliationStatus.WRONG_CONTENT)).toBe(true);
    expect(isException(ReconciliationStatus.UNDERPAID)).toBe(true);
    expect(isException(ReconciliationStatus.OVERPAID)).toBe(true);
    expect(isException(ReconciliationStatus.LATE)).toBe(true);
    expect(isException(ReconciliationStatus.MATCHED)).toBe(false);
    expect(isException(ReconciliationStatus.MANUALLY_RESOLVED)).toBe(false);
  });

  it('bắt buộc ghi chú khi xử lý đối soát', () => {
    expect(() => assertResolutionNote('')).toThrowError(AppError);
    expect(() => assertResolutionNote('   ')).toThrowError(AppError);
    expect(() => assertResolutionNote(undefined)).toThrowError(AppError);
    expect(() => assertResolutionNote('Đã đối chiếu sao kê')).not.toThrow();
  });

  it('không cho xử lý giao dịch đã đối soát', () => {
    expect(() => assertResolvable(txn(ReconciliationStatus.MATCHED))).toThrowError(AppError);
    expect(() => assertResolvable(txn(ReconciliationStatus.MANUALLY_RESOLVED))).toThrowError(
      AppError,
    );
    expect(() => assertResolvable(txn(ReconciliationStatus.UNDERPAID))).not.toThrow();
  });

  it('mã hoá kết quả xử lý theo từng action', () => {
    expect(resolveOutcome('MARK_PAID')).toEqual({
      reconciliationStatus: ReconciliationStatus.MATCHED,
      status: RefundStatus.COMPLETED,
      markOrderPaid: true,
      refund: false,
    });
    expect(resolveOutcome('REFUND_BACK').refund).toBe(true);
    expect(resolveOutcome('REFUND_BACK').status).toBe(RefundStatus.PENDING);
    expect(resolveOutcome('IGNORE').markOrderPaid).toBe(false);
    expect(resolveOutcome('IGNORE').reconciliationStatus).toBe(
      ReconciliationStatus.MANUALLY_RESOLVED,
    );
  });

  it('tính số tiền cần thu theo hình thức cọc', () => {
    const full = {
      totalAmount: 10_000_000,
      payment: { collectionType: 'FULL', depositAmount: null },
    };
    const deposit = {
      totalAmount: 10_000_000,
      payment: { collectionType: 'DEPOSIT', depositAmount: 3_000_000 },
    };
    expect(expectedAmountOf(full)).toBe(10_000_000);
    expect(expectedAmountOf(deposit)).toBe(3_000_000);
  });

  it('chỉ giao dịch thu tiền mới gắn được vào đơn', () => {
    expect(isCollectionTransaction(TransactionType.REFUND)).toBe(false);
    expect(isCollectionTransaction(TransactionType.FULL_PAYMENT)).toBe(true);
    expect(isCollectionTransaction(TransactionType.COD_COLLECTION)).toBe(true);
  });
});
