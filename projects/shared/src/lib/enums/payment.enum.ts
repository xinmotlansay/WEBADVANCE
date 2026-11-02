import type { OrderBadgeTone } from './order.enum';

export enum PaymentMethod {
  COD = 'COD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PaymentCollectionType {
  FULL = 'FULL',
  DEPOSIT = 'DEPOSIT',
}

export enum OrderPaymentStatus {
  PENDING = 'PENDING',
  DEPOSITED = 'DEPOSITED',
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  [OrderPaymentStatus.PENDING]: 'Chờ thanh toán',
  [OrderPaymentStatus.DEPOSITED]: 'Đã cọc',
  [OrderPaymentStatus.PAID]: 'Đã thanh toán',
  [OrderPaymentStatus.UNPAID]: 'Chưa thanh toán (COD)',
  [OrderPaymentStatus.FAILED]: 'Thất bại',
  [OrderPaymentStatus.REFUNDED]: 'Đã hoàn tiền',
};

export const PAYMENT_STATUS_TONE: Record<OrderPaymentStatus, OrderBadgeTone> = {
  [OrderPaymentStatus.PENDING]: 'neutral',
  [OrderPaymentStatus.DEPOSITED]: 'info',
  [OrderPaymentStatus.PAID]: 'success',
  [OrderPaymentStatus.UNPAID]: 'warning',
  [OrderPaymentStatus.FAILED]: 'danger',
  [OrderPaymentStatus.REFUNDED]: 'neutral',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.COD]: 'Thanh toán khi nhận hàng',
  [PaymentMethod.BANK_TRANSFER]: 'Chuyển khoản QR',
};

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  FULL_PAYMENT = 'FULL_PAYMENT',
  COD_COLLECTION = 'COD_COLLECTION',
  DIFFERENCE_COLLECTION = 'DIFFERENCE_COLLECTION',
  REFUND = 'REFUND',
}

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  [TransactionType.DEPOSIT]: 'Thu cọc',
  [TransactionType.FULL_PAYMENT]: 'Thu toàn bộ',
  [TransactionType.COD_COLLECTION]: 'Thu COD',
  [TransactionType.DIFFERENCE_COLLECTION]: 'Thu chênh lệch',
  [TransactionType.REFUND]: 'Hoàn tiền',
};

export enum RecordSource {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export const RECORD_SOURCE_LABEL: Record<RecordSource, string> = {
  [RecordSource.AUTO]: 'Tự động',
  [RecordSource.MANUAL]: 'Thủ công',
};

export enum ReconciliationStatus {
  MATCHED = 'MATCHED',
  WRONG_CONTENT = 'WRONG_CONTENT',
  UNDERPAID = 'UNDERPAID',
  OVERPAID = 'OVERPAID',
  LATE = 'LATE',
  MANUALLY_RESOLVED = 'MANUALLY_RESOLVED',
}

export const RECONCILIATION_STATUS_TONE: Record<ReconciliationStatus, OrderBadgeTone> = {
  [ReconciliationStatus.MATCHED]: 'success',
  [ReconciliationStatus.WRONG_CONTENT]: 'warning',
  [ReconciliationStatus.UNDERPAID]: 'danger',
  [ReconciliationStatus.OVERPAID]: 'warning',
  [ReconciliationStatus.LATE]: 'warning',
  [ReconciliationStatus.MANUALLY_RESOLVED]: 'info',
};

export const RECONCILIATION_LABEL: Record<ReconciliationStatus, string> = {
  [ReconciliationStatus.MATCHED]: 'Khớp',
  [ReconciliationStatus.WRONG_CONTENT]: 'Sai nội dung',
  [ReconciliationStatus.UNDERPAID]: 'Thiếu tiền',
  [ReconciliationStatus.OVERPAID]: 'Thừa tiền',
  [ReconciliationStatus.LATE]: 'Chuyển sau hạn',
  [ReconciliationStatus.MANUALLY_RESOLVED]: 'Đã xử lý thủ công',
};

export enum RefundStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  [RefundStatus.PENDING]: 'Chờ hoàn tiền',
  [RefundStatus.COMPLETED]: 'Đã hoàn tiền',
  [RefundStatus.FAILED]: 'Hoàn tiền thất bại',
};

export type ResolveAction = 'MARK_PAID' | 'REFUND_BACK' | 'IGNORE';

export const RESOLVE_ACTION_LABEL: Record<ResolveAction, string> = {
  MARK_PAID: 'Ghi nhận đã thanh toán',
  REFUND_BACK: 'Hoàn trả lại khách',
  IGNORE: 'Bỏ qua giao dịch',
};
