import type { Observable } from 'rxjs';
import type {
  ApiPageResponse,
  ReceiveReturnRequest,
  ApproveRefundRequest,
  RejectReturnRequest,
  ReturnListQuery,
  ReturnRequest,
  UpdateReturnRequest,
} from 'shared';

export abstract class AdminReturnApi {
  abstract list(query: ReturnListQuery): Observable<ApiPageResponse<ReturnRequest>>;
  abstract get(id: string): Observable<ReturnRequest>;
  abstract confirm(id: string): Observable<ReturnRequest>;
  abstract reject(id: string, request: RejectReturnRequest): Observable<ReturnRequest>;
  abstract update(id: string, request: UpdateReturnRequest): Observable<ReturnRequest>;
  abstract receive(id: string, request: ReceiveReturnRequest): Observable<ReturnRequest>;
  abstract approveRefund(id: string, request: ApproveRefundRequest): Observable<ReturnRequest>;
  abstract complete(id: string): Observable<ReturnRequest>;
}
