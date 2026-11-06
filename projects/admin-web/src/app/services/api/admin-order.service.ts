import type { Observable } from 'rxjs';
import type { ApiPageResponse } from 'shared';
import type {
  AdminCancelOrderRequest as CancelOrderRequest,
  AdminOrderDetail as OrderDetail,
  OrderListItem,
  OrderListQuery,
  UpdateOrderStatusRequest,
  UpdateShipmentRequest,
  FinalizeReturnRequest,
} from 'shared';

export abstract class AdminOrderApi {
  abstract list(query: OrderListQuery): Observable<ApiPageResponse<OrderListItem>>;
  abstract get(id: string): Observable<OrderDetail>;
  abstract confirm(id: string): Observable<OrderDetail>;
  abstract updateStatus(id: string, request: UpdateOrderStatusRequest): Observable<OrderDetail>;
  abstract cancel(id: string, request: CancelOrderRequest): Observable<OrderDetail>;
  abstract updateShipment(id: string, request: UpdateShipmentRequest): Observable<OrderDetail>;
  abstract finalizeReturn(id: string, request: FinalizeReturnRequest): Observable<OrderDetail>;
}
