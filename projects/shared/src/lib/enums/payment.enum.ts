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
  /** Đơn đã hủy, đã thu tiền: chờ Order Admin xác nhận hoàn tiền. */
  REFUND_PENDING = 'REFUND_PENDING',
  /** Đơn đã hủy: Order Admin đã xác nhận, đang chuyển tiền hoàn cho khách. */
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
}

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  [OrderPaymentStatus.PENDING]: 'Chờ thanh toán',
  [OrderPaymentStatus.DEPOSITED]: 'Đã cọc',
  [OrderPaymentStatus.PAID]: 'Đã thanh toán',
  [OrderPaymentStatus.UNPAID]: 'Chưa thanh toán (COD)',
  [OrderPaymentStatus.FAILED]: 'Thất bại',
  [OrderPaymentStatus.REFUND_PENDING]: 'Chờ hoàn tiền',
  [OrderPaymentStatus.REFUNDING]: 'Đang hoàn tiền',
  [OrderPaymentStatus.REFUNDED]: 'Đã hoàn tiền',
};

export const PAYMENT_STATUS_TONE: Record<OrderPaymentStatus, OrderBadgeTone> = {
  [OrderPaymentStatus.PENDING]: 'neutral',
  [OrderPaymentStatus.DEPOSITED]: 'info',
  [OrderPaymentStatus.PAID]: 'success',
  [OrderPaymentStatus.UNPAID]: 'warning',
  [OrderPaymentStatus.FAILED]: 'danger',
  [OrderPaymentStatus.REFUND_PENDING]: 'warning',
  [OrderPaymentStatus.REFUNDING]: 'info',
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
  /** Order Admin đã xác nhận hoàn, đang chuyển tiền cho khách. */
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  [RefundStatus.PENDING]: 'Chờ hoàn tiền',
  [RefundStatus.PROCESSING]: 'Đang hoàn tiền',
  [RefundStatus.COMPLETED]: 'Đã hoàn tiền',
  [RefundStatus.FAILED]: 'Hoàn tiền thất bại',
};

export type ResolveAction = 'MARK_PAID' | 'REFUND_BACK' | 'IGNORE';

export const RESOLVE_ACTION_LABEL: Record<ResolveAction, string> = {
  MARK_PAID: 'Ghi nhận đã thanh toán',
  REFUND_BACK: 'Hoàn trả lại khách',
  IGNORE: 'Bỏ qua giao dịch',
};

/** Hoàn tiền về đâu: đơn chuyển khoản hoàn về tài khoản đã chuyển tới, đơn COD hoàn về tài khoản khách nhập. */
export enum RefundDestination {
  SOURCE_BANK = 'SOURCE_BANK',
  CUSTOMER_ACCOUNT = 'CUSTOMER_ACCOUNT',
}

export const REFUND_DESTINATION_LABEL: Record<RefundDestination, string> = {
  [RefundDestination.SOURCE_BANK]: 'Về tài khoản đã chuyển tiền',
  [RefundDestination.CUSTOMER_ACCOUNT]: 'Về tài khoản khách cung cấp',
};

/** Khoản hoàn phát sinh từ đâu. */
export enum RefundSource {
  ORDER_CANCEL = 'ORDER_CANCEL',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RETURN = 'RETURN',
  RECONCILIATION = 'RECONCILIATION',
}

export const REFUND_SOURCE_LABEL: Record<RefundSource, string> = {
  [RefundSource.ORDER_CANCEL]: 'Hủy đơn',
  [RefundSource.DELIVERY_FAILED]: 'Giao thất bại',
  [RefundSource.RETURN]: 'Trả hàng',
  [RefundSource.RECONCILIATION]: 'Đối soát (tiền chuyển lệch)',
};
