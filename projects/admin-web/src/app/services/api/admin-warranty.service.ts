import type { Observable } from 'rxjs';
import type {
  ApiPageResponse,
  RejectWarrantyRequest,
  UpdateWarrantyStatusRequest,
  WarrantyListQuery,
  WarrantyRequest,
} from 'shared';

export abstract class AdminWarrantyApi {
  abstract list(query: WarrantyListQuery): Observable<ApiPageResponse<WarrantyRequest>>;
  abstract get(id: string): Observable<WarrantyRequest>;
  abstract accept(id: string): Observable<WarrantyRequest>;
  abstract reject(id: string, request: RejectWarrantyRequest): Observable<WarrantyRequest>;
  abstract updateStatus(id: string, request: UpdateWarrantyStatusRequest): Observable<WarrantyRequest>;
}
