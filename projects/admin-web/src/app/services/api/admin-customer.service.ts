import type { Observable } from 'rxjs';
import type {
  AdminCustomer,
  AdminCustomerListQuery,
  ApiPageResponse,
} from 'shared';

export abstract class AdminCustomerApi {
  abstract list(query: AdminCustomerListQuery): Observable<ApiPageResponse<AdminCustomer>>;
  abstract get(id: string): Observable<AdminCustomer>;
}
