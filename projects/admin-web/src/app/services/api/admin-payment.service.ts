import type { Observable } from 'rxjs';
import type {
  ApiPageResponse,
  CompleteRefundRequest,
  PaymentException,
  PaymentListQuery,
  PaymentTransaction,
  ResolvePaymentRequest,
  StartRefundRequest,
} from 'shared';

export abstract class AdminPaymentApi {
  abstract list(query: PaymentListQuery): Observable<ApiPageResponse<PaymentTransaction>>;
  abstract exceptions(): Observable<PaymentException[]>;
  abstract resolve(transactionId: string, request: ResolvePaymentRequest): Observable<PaymentTransaction>;
  /** Các khoản hoàn tiền đang chờ chuyển trả khách. */
  abstract pendingRefunds(): Observable<PaymentTransaction[]>;
  /** Bước 1: xác nhận hoàn tiền, khoản hoàn chuyển sang "Đang hoàn tiền". */
  abstract startRefund(transactionId: string, request: StartRefundRequest): Observable<PaymentTransaction>;
  abstract uploadProof(file: File): Observable<string>;
  /** Bước 2: hoàn tất hoàn tiền (thủ công, kèm chứng từ). */
  abstract completeRefund(transactionId: string, request: CompleteRefundRequest): Observable<PaymentTransaction>;
}
