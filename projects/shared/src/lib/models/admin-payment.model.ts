import type { OrderStatus } from '../enums/order.enum';
import type {
  ReconciliationStatus,
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
  page?: number;
  limit?: number;
}

export interface ResolvePaymentRequest {
  orderId?: string;
  action: 'MARK_PAID' | 'REFUND_BACK' | 'IGNORE';
  note: string;
}
