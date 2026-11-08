import type { OrderStatus } from '../enums/order.enum';
import type {
  ReconciliationStatus,
  RefundDestination,
  RefundSource,
  RefundStatus,
  TransactionType,
} from '../enums/payment.enum';

export interface PaymentTransaction {
  id: string;
  orderId?: string | null;
  orderCode?: string | null;
  customerName?: string | null;
  type: TransactionType;
  amount: number;
  recordSource: 'AUTO' | 'MANUAL';
  bankTransactionCode?: string | null;
  receivedContent?: string | null;
  reconciliationStatus: ReconciliationStatus;
  status: RefundStatus;
  note?: string | null;
  handledBy?: string | null;
  transactionAt: string;
  refundAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  } | null;
  /** Chỉ có ở giao dịch hoàn tiền (`type = REFUND`). */
  refundTo?: RefundDestination | null;
  refundSource?: RefundSource | null;
  /** Mã giao dịch ngân hàng của khoản đã thu, để tra khi hoàn về tài khoản nguồn. */
  originalTransactionCode?: string | null;
  proofImage?: string | null;
  returnRequestId?: string | null;
  returnCode?: string | null;
}

export interface PaymentException {
  transaction: PaymentTransaction;
  orderStatus: OrderStatus;
  expectedAmount: number;
  receivedAmount: number;
  reason: ReconciliationStatus;
  transferContent?: string | null;
}

export interface PaymentListQuery {
  q?: string;
  reconciliationStatus?: ReconciliationStatus | 'ALL';
  type?: TransactionType | 'ALL';
  status?: RefundStatus | 'ALL';
  page?: number;
  limit?: number;
}

export interface ResolvePaymentRequest {
  orderId?: string;
  action: 'MARK_PAID' | 'REFUND_BACK' | 'IGNORE';
  note: string;
}

/** Admin báo đã chuyển tiền hoàn cho khách. */
export interface CompleteRefundRequest {
  /** Số tiền thực hoàn; bỏ trống thì lấy đúng số tiền của khoản hoàn. */
  amount?: number;
  transactionAt: string;
  proofImage: string;
  note: string;
}

/** Order Admin xác nhận bắt đầu hoàn tiền: khoản hoàn chuyển sang "Đang hoàn tiền". */
export interface StartRefundRequest {
  note?: string;
}
