import type { Observable } from 'rxjs';
import type {
  ApiPageResponse,
  ReceiveReturnRequest,
  RefundReturnRequest,
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
  abstract uploadProof(file: File): Observable<string>;
  abstract refund(id: string, request: RefundReturnRequest): Observable<ReturnRequest>;
  abstract complete(id: string): Observable<ReturnRequest>;
}
