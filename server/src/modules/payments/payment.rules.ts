import { AppError } from '../../lib/app-error.js';
import {
  ReconciliationStatus,
  RefundDestination,
  RefundSource,
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
      // Giao dịch lệch được đóng lại; khoản cần chuyển trả nằm ở một giao dịch hoàn tiền riêng.
      return {
        reconciliationStatus: ReconciliationStatus.MANUALLY_RESOLVED,
        status: RefundStatus.COMPLETED,
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

/* ----------------------------- Hoàn tiền ----------------------------- */

export interface PaidOrderInfo {
  totalAmount: number;
  payment: { status: string; depositAmount?: number | null; statusBeforeRefund?: string | null };
}

/** Khoản hoàn của đơn bị hủy hoặc giao thất bại: đơn đi theo Chờ hoàn tiền, Đang hoàn tiền, Đã hoàn tiền. */
export const ORDER_REFUND_SOURCES: RefundSource[] = [
  RefundSource.ORDER_CANCEL,
  RefundSource.DELIVERY_FAILED,
];

export function isOrderRefundSource(source: RefundSource | string | null | undefined): boolean {
  return ORDER_REFUND_SOURCES.includes(source as RefundSource);
}

/**
 * Đơn COD chỉ có tiền khi đã giao, nên hoàn về tài khoản khách nhập. Đơn chuyển khoản hoàn về
 * chính tài khoản đã chuyển tới, theo quy định của ngân hàng.
 */
export function refundDestinationFor(method: string): RefundDestination {
  return method === 'COD' ? RefundDestination.CUSTOMER_ACCOUNT : RefundDestination.SOURCE_BANK;
}

/** Số tiền đơn đã thu được. Đơn đã hoàn toàn bộ thì coi như không còn gì để hoàn. */
export function paidAmountOf(order: PaidOrderInfo): number {
  const status = ['REFUND_PENDING', 'REFUNDING'].includes(order.payment.status)
    ? order.payment.statusBeforeRefund
    : order.payment.status;
  if (status === 'PAID') return order.totalAmount;
  if (status === 'DEPOSITED') return order.payment.depositAmount ?? 0;
  return 0;
}

/** Tổng các khoản hoàn (đang chờ và đã xong) không được vượt số tiền đã thu: chặn hoàn hai lần. */
export function assertRefundWithinPaid(paid: number, alreadyRequested: number, amount: number): void {
  if (amount <= 0) {
    throw new AppError('REFUND_AMOUNT_INVALID', 400, 'Số tiền hoàn phải lớn hơn 0');
  }
  if (alreadyRequested + amount > paid) {
    throw new AppError(
      'REFUND_EXCEEDS_PAID',
      409,
      'Tổng tiền hoàn vượt số tiền khách đã thanh toán (đơn có thể đã được hoàn)',
      { paid, alreadyRequested, amount },
    );
  }
}

/**
 * Đơn chuyển sang "Đã hoàn tiền" khi đã hoàn đủ số tiền đã thu. Đơn đã hủy thì chỉ cần mọi khoản
 * hoàn đều xong (có thể ít hơn số đã thu vì trừ phí vận chuyển). Trả một phần sản phẩm thì giữ nguyên.
 */
export function isFullyRefunded(
  paid: number,
  completed: number,
  options: { pending?: number; orderCancelled?: boolean } = {},
): boolean {
  if (paid <= 0 || completed <= 0) return false;
  if (completed >= paid) return true;
  return Boolean(options.orderCancelled) && (options.pending ?? 0) === 0;
}

export interface RefundTransactionInfo {
  type: TransactionType;
  status: RefundStatus;
  refundTo?: RefundDestination | null;
  refundAccount?: { accountNumber?: string | null } | null;
}

function assertIsRefund(transaction: RefundTransactionInfo): void {
  if (transaction.type !== TransactionType.REFUND) {
    throw new AppError('NOT_A_REFUND', 409, 'Giao dịch này không phải khoản hoàn tiền');
  }
}

/** Hoàn về tài khoản khách thì phải có tài khoản trước khi bắt đầu chuyển tiền. */
function assertHasRefundAccount(transaction: RefundTransactionInfo): void {
  if (
    transaction.refundTo === RefundDestination.CUSTOMER_ACCOUNT &&
    !transaction.refundAccount?.accountNumber
  ) {
    throw new AppError(
      'REFUND_ACCOUNT_REQUIRED',
      409,
      'Chưa có tài khoản nhận hoàn tiền của khách, cần liên hệ khách trước khi hoàn',
    );
  }
}

/** Bước 1: xác nhận hoàn tiền. Chỉ khoản đang chờ mới chuyển sang "Đang hoàn tiền". */
export function assertRefundStartable(transaction: RefundTransactionInfo): void {
  assertIsRefund(transaction);
  if (transaction.status !== RefundStatus.PENDING) {
    throw new AppError('REFUND_NOT_PENDING', 409, 'Khoản hoàn này không còn ở trạng thái chờ hoàn tiền');
  }
  assertHasRefundAccount(transaction);
}

/** Bước 2: hoàn tất hoàn tiền (thủ công vì chưa nối ngân hàng). Chỉ khoản đang hoàn mới hoàn tất được. */
export function assertRefundCompletable(transaction: RefundTransactionInfo): void {
  assertIsRefund(transaction);
  if (transaction.status !== RefundStatus.PROCESSING) {
    throw new AppError(
      'REFUND_NOT_PROCESSING',
      409,
      transaction.status === RefundStatus.COMPLETED
        ? 'Khoản hoàn này đã được xử lý'
        : 'Cần xác nhận hoàn tiền (chuyển sang Đang hoàn tiền) trước khi hoàn tất',
    );
  }
  assertHasRefundAccount(transaction);
}
