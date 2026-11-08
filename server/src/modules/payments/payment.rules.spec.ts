import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/app-error.js';
import {
  ReconciliationStatus,
  RefundDestination,
  RefundStatus,
  TransactionType,
} from '../../lib/shared-enums.js';
import {
  assertRefundCompletable,
  assertRefundStartable,
  assertRefundWithinPaid,
  assertResolvable,
  assertResolutionNote,
  expectedAmountOf,
  isCollectionTransaction,
  isException,
  isFullyRefunded,
  isOrderRefundSource,
  paidAmountOf,
  refundDestinationFor,
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
    // Giao dịch lệch được đóng lại; khoản chuyển trả nằm ở giao dịch hoàn tiền riêng (đang chờ).
    expect(resolveOutcome('REFUND_BACK').status).toBe(RefundStatus.COMPLETED);
    expect(resolveOutcome('REFUND_BACK').reconciliationStatus).toBe(
      ReconciliationStatus.MANUALLY_RESOLVED,
    );
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

describe('refund rules', () => {
  it('chỉ hủy đơn và giao thất bại mới đổi trạng thái thanh toán của đơn theo khoản hoàn', () => {
    expect(isOrderRefundSource('ORDER_CANCEL')).toBe(true);
    expect(isOrderRefundSource('DELIVERY_FAILED')).toBe(true);
    // Trả hàng có thể chỉ hoàn một phần đơn; tiền chuyển lệch chưa thuộc đơn nào.
    expect(isOrderRefundSource('RETURN')).toBe(false);
    expect(isOrderRefundSource('RECONCILIATION')).toBe(false);
    expect(isOrderRefundSource(null)).toBe(false);
  });

  it('đơn COD hoàn về tài khoản khách nhập, đơn chuyển khoản hoàn về tài khoản nguồn', () => {
    expect(refundDestinationFor('COD')).toBe(RefundDestination.CUSTOMER_ACCOUNT);
    expect(refundDestinationFor('BANK_TRANSFER')).toBe(RefundDestination.SOURCE_BANK);
  });

  it('số tiền đã thu theo trạng thái thanh toán', () => {
    const order = (status: string, depositAmount: number | null = null) => ({
      totalAmount: 10_000_000,
      payment: { status, depositAmount },
    });
    expect(paidAmountOf(order('PAID'))).toBe(10_000_000);
    expect(paidAmountOf(order('DEPOSITED', 3_000_000))).toBe(3_000_000);
    expect(paidAmountOf(order('PENDING'))).toBe(0);
    expect(paidAmountOf(order('UNPAID'))).toBe(0);
    // Đã hoàn toàn bộ thì không còn gì để hoàn tiếp.
    expect(paidAmountOf(order('REFUNDED'))).toBe(0);
    // Đang chờ hoàn hoặc đang hoàn: vẫn tính số đã thu theo trạng thái trước đó.
    const refunding = (status: string, before: string, depositAmount: number | null = null) => ({
      totalAmount: 10_000_000,
      payment: { status, depositAmount, statusBeforeRefund: before },
    });
    expect(paidAmountOf(refunding('REFUND_PENDING', 'PAID'))).toBe(10_000_000);
    expect(paidAmountOf(refunding('REFUNDING', 'DEPOSITED', 3_000_000))).toBe(3_000_000);
  });

  it('chặn hoàn vượt số đã thu hoặc hoàn hai lần', () => {
    expect(() => assertRefundWithinPaid(10_000_000, 0, 10_000_000)).not.toThrow();
    expect(() => assertRefundWithinPaid(10_000_000, 4_000_000, 6_000_000)).not.toThrow();
    expect(() => assertRefundWithinPaid(10_000_000, 4_000_000, 6_000_001)).toThrowError(AppError);
    expect(() => assertRefundWithinPaid(10_000_000, 10_000_000, 1)).toThrowError(AppError);
    expect(() => assertRefundWithinPaid(0, 0, 1_000)).toThrowError(AppError);
    expect(() => assertRefundWithinPaid(10_000_000, 0, 0)).toThrowError(AppError);
  });

  it('đơn chỉ thành "Đã hoàn tiền" khi hoàn đủ, hoặc đơn hủy đã xử lý hết khoản chờ', () => {
    expect(isFullyRefunded(10_000_000, 10_000_000)).toBe(true);
    expect(isFullyRefunded(10_000_000, 4_000_000)).toBe(false);
    expect(isFullyRefunded(0, 0)).toBe(false);
    // Hoàn trừ phí vận chuyển: ít hơn số đã thu nhưng đơn đã hủy và không còn khoản chờ.
    expect(isFullyRefunded(10_000_000, 9_500_000, { orderCancelled: true, pending: 0 })).toBe(true);
    expect(isFullyRefunded(10_000_000, 9_500_000, { orderCancelled: true, pending: 100 })).toBe(false);
    expect(isFullyRefunded(10_000_000, 4_000_000, { orderCancelled: false, pending: 0 })).toBe(false);
  });

  const refund = {
    type: TransactionType.REFUND,
    status: RefundStatus.PENDING,
    refundTo: RefundDestination.SOURCE_BANK,
    refundAccount: null,
  };
  const codRefund = {
    ...refund,
    refundTo: RefundDestination.CUSTOMER_ACCOUNT,
    refundAccount: { accountNumber: '0123456789' },
  };

  it('bước 1 xác nhận hoàn tiền: chỉ khoản đang chờ, và đơn COD phải có tài khoản nhận', () => {
    expect(() => assertRefundStartable(refund)).not.toThrow();
    expect(() => assertRefundStartable(codRefund)).not.toThrow();
    expect(() =>
      assertRefundStartable({ ...refund, type: TransactionType.FULL_PAYMENT }),
    ).toThrowError(AppError);
    expect(() =>
      assertRefundStartable({ ...refund, status: RefundStatus.PROCESSING }),
    ).toThrowError(AppError);
    expect(() =>
      assertRefundStartable({ ...refund, status: RefundStatus.COMPLETED }),
    ).toThrowError(AppError);
    expect(() =>
      assertRefundStartable({ ...refund, refundTo: RefundDestination.CUSTOMER_ACCOUNT }),
    ).toThrowError(AppError);
  });

  it('bước 2 hoàn tất hoàn tiền: phải qua bước đang hoàn, không nhảy cóc từ chờ hoàn', () => {
    const processing = { ...refund, status: RefundStatus.PROCESSING };
    expect(() => assertRefundCompletable(processing)).not.toThrow();
    expect(() => assertRefundCompletable({ ...codRefund, status: RefundStatus.PROCESSING })).not.toThrow();
    expect(() => assertRefundCompletable(refund)).toThrowError(AppError);
    expect(() =>
      assertRefundCompletable({ ...processing, status: RefundStatus.COMPLETED }),
    ).toThrowError(AppError);
    expect(() =>
      assertRefundCompletable({ ...processing, type: TransactionType.DEPOSIT }),
    ).toThrowError(AppError);
    expect(() =>
      assertRefundCompletable({
        ...processing,
        refundTo: RefundDestination.CUSTOMER_ACCOUNT,
        refundAccount: null,
      }),
    ).toThrowError(AppError);
  });
});
