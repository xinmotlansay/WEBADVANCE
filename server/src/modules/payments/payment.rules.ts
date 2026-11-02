import { AppError } from '../../lib/app-error.js';
import {
  ReconciliationStatus,
  RefundStatus,
  TransactionType,
} from '../../lib/shared-enums.js';
import type { PaymentTransactionDoc } from './payment.model.js';

/** Các trạng thái cần admin đối soát thủ công. */
export const EXCEPTION_STATUSES: ReconciliationStatus[] = [
  ReconciliationStatus.WRONG_CONTENT,
  ReconciliationStatus.UNDERPAID,
  ReconciliationStatus.OVERPAID,
  ReconciliationStatus.LATE,
];

export function isException(status: ReconciliationStatus): boolean {
  return EXCEPTION_STATUSES.includes(status);
}

/** Giao dịch đã xử lý xong thì không được xử lý lần hai. */
export function assertResolvable(transaction: PaymentTransactionDoc): void {
  if (!isException(transaction.reconciliationStatus)) {
    throw new AppError(
      'PAYMENT_ALREADY_RESOLVED',
      409,
      'Giao dịch này đã được đối soát, không xử lý lại',
      { reconciliationStatus: transaction.reconciliationStatus },
    );
  }
}

export function assertResolutionNote(note: string | undefined | null): void {
  if (!note || !note.trim()) {
    throw new AppError('VALIDATION_ERROR', 400, 'Vui lòng ghi chú xử lý đối soát');
  }
}

export interface ResolveOutcome {
  reconciliationStatus: ReconciliationStatus;
  status: RefundStatus;
  markOrderPaid: boolean;
  refund: boolean;
}

export function resolveOutcome(action: 'MARK_PAID' | 'REFUND_BACK' | 'IGNORE'): ResolveOutcome {
  switch (action) {
    case 'MARK_PAID':
      return {
        reconciliationStatus: ReconciliationStatus.MATCHED,
        status: RefundStatus.COMPLETED,
        markOrderPaid: true,
        refund: false,
      };
    case 'REFUND_BACK':
      return {
        reconciliationStatus: ReconciliationStatus.MANUALLY_RESOLVED,
        status: RefundStatus.PENDING,
        markOrderPaid: false,
        refund: true,
      };
    case 'IGNORE':
    default:
      return {
        reconciliationStatus: ReconciliationStatus.MANUALLY_RESOLVED,
        status: RefundStatus.COMPLETED,
        markOrderPaid: false,
        refund: false,
      };
  }
}

/** Số tiền cần thu của đơn: cọc thì lấy tiền cọc, còn lại lấy tổng đơn. */
export function expectedAmountOf(order: {
  totalAmount: number;
  payment: { collectionType?: string | null; depositAmount?: number | null };
}): number {
  if (order.payment.collectionType === 'DEPOSIT' && order.payment.depositAmount) {
    return order.payment.depositAmount;
  }
  return order.totalAmount;
}

/** Giao dịch thu tiền (không phải hoàn tiền) mới có thể gắn vào đơn. */
export function isCollectionTransaction(type: TransactionType): boolean {
  return type !== TransactionType.REFUND;
}
