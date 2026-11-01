import type { Observable } from 'rxjs';
import type { ApiPageResponse, PaymentException, PaymentListQuery, PaymentTransaction, ResolvePaymentRequest } from 'shared';

export abstract class AdminPaymentApi {
  abstract list(query: PaymentListQuery): Observable<ApiPageResponse<PaymentTransaction>>;
  abstract exceptions(): Observable<PaymentException[]>;
  abstract resolve(transactionId: string, request: ResolvePaymentRequest): Observable<PaymentTransaction>;
}
