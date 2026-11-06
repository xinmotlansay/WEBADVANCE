import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  AdminCustomer,
  AdminCustomerListQuery,
  ApiPageResponse,
  ApiResponse,
  AdminCancelOrderRequest as CancelOrderRequest,
  ChatMessageView,
  CompleteRefundRequest,
  ChatSessionView,
  FinalizeReturnRequest,
  LateCompensationRequest,
  OrderDashboardSummary,
  AdminOrderDetail as OrderDetail,
  OrderListItem,
  OrderListQuery,
  OrderReport,
  PaymentException,
  PaymentListQuery,
  PaymentTransaction,
  ReceiveReturnRequest,
  ApproveRefundRequest,
  RejectReturnRequest,
  RejectWarrantyRequest,
  ReportPeriod,
  ResolvePaymentRequest,
  StartRefundRequest,
  ReturnListQuery,
  ReturnRequest,
  UpdateOrderStatusRequest,
  UpdateReturnRequest,
  UpdateShipmentRequest,
  UpdateWarrantyStatusRequest,
  WarrantyListQuery,
  WarrantyRequest,
} from 'shared';
import { API_BASE } from '../../config/admin-environment';
import { AdminChatApi } from '../../../services/api/admin-chat.service';
import { AdminCustomerApi } from '../../../services/api/admin-customer.service';
import { AdminDashboardApi, AdminReportApi } from '../../../services/api/admin-dashboard.service';
import { AdminOrderApi } from '../../../services/api/admin-order.service';
import { AdminPaymentApi } from '../../../services/api/admin-payment.service';
import { AdminReturnApi } from '../../../services/api/admin-return.service';
import { AdminWarrantyApi } from '../../../services/api/admin-warranty.service';

function paramsOf(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class HttpAdminOrderApi extends AdminOrderApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/orders`;

  override list(query: OrderListQuery): Observable<ApiPageResponse<OrderListItem>> {
    return this.http.get<ApiPageResponse<OrderListItem>>(this.base, { params: paramsOf(query) });
  }
  override get(id: string): Observable<OrderDetail> {
    return this.http
      .get<ApiResponse<OrderDetail>>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
  override confirm(id: string): Observable<OrderDetail> {
    return this.http
      .post<ApiResponse<OrderDetail>>(`${this.base}/${encodeURIComponent(id)}/confirm`, {})
      .pipe(map((res) => res.data));
  }
  override updateStatus(id: string, request: UpdateOrderStatusRequest): Observable<OrderDetail> {
    return this.http
      .patch<ApiResponse<OrderDetail>>(`${this.base}/${encodeURIComponent(id)}/status`, request)
      .pipe(map((res) => res.data));
  }
  override cancel(id: string, request: CancelOrderRequest): Observable<OrderDetail> {
    return this.http
      .post<ApiResponse<OrderDetail>>(`${this.base}/${encodeURIComponent(id)}/cancel`, request)
      .pipe(map((res) => res.data));
  }
  override updateShipment(id: string, request: UpdateShipmentRequest): Observable<OrderDetail> {
    return this.http
      .put<ApiResponse<OrderDetail>>(`${this.base}/${encodeURIComponent(id)}/shipment`, request)
      .pipe(map((res) => res.data));
  }
  override finalizeReturn(id: string, request: FinalizeReturnRequest): Observable<OrderDetail> {
    return this.http
      .post<ApiResponse<OrderDetail>>(
        `${this.base}/${encodeURIComponent(id)}/finalize-return`,
        request,
      )
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminPaymentApi extends AdminPaymentApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/payments`;

  override list(query: PaymentListQuery): Observable<ApiPageResponse<PaymentTransaction>> {
    return this.http.get<ApiPageResponse<PaymentTransaction>>(this.base, {
      params: paramsOf(query),
    });
  }
  override exceptions(): Observable<PaymentException[]> {
    return this.http
      .get<ApiResponse<PaymentException[]>>(`${this.base}/exceptions`)
      .pipe(map((res) => res.data));
  }
  override resolve(
    transactionId: string,
    request: ResolvePaymentRequest,
  ): Observable<PaymentTransaction> {
    return this.http
      .post<ApiResponse<PaymentTransaction>>(
        `${this.base}/${encodeURIComponent(transactionId)}/resolve`,
        request,
      )
      .pipe(map((res) => res.data));
  }
  override pendingRefunds(): Observable<PaymentTransaction[]> {
    return this.http
      .get<ApiResponse<PaymentTransaction[]>>(`${this.base}/refunds/pending`)
      .pipe(map((res) => res.data));
  }
  override uploadProof(file: File): Observable<string> {
    return this.http
      .post<ApiResponse<{ url: string }>>(`${API_BASE}/admin/uploads/refund-proofs`, file, {
        headers: { 'Content-Type': file.type },
      })
      .pipe(map((res) => res.data.url));
  }
  override startRefund(
    transactionId: string,
    request: StartRefundRequest,
  ): Observable<PaymentTransaction> {
    return this.http
      .post<ApiResponse<PaymentTransaction>>(
        `${this.base}/${encodeURIComponent(transactionId)}/refund/start`,
        request,
      )
      .pipe(map((res) => res.data));
  }
  override completeRefund(
    transactionId: string,
    request: CompleteRefundRequest,
  ): Observable<PaymentTransaction> {
    return this.http
      .post<ApiResponse<PaymentTransaction>>(
        `${this.base}/${encodeURIComponent(transactionId)}/refund`,
        request,
      )
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminReturnApi extends AdminReturnApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/return-requests`;

  override list(query: ReturnListQuery): Observable<ApiPageResponse<ReturnRequest>> {
    return this.http.get<ApiPageResponse<ReturnRequest>>(this.base, { params: paramsOf(query) });
  }
  override get(id: string): Observable<ReturnRequest> {
    return this.http
      .get<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
  override confirm(id: string): Observable<ReturnRequest> {
    return this.http
      .post<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}/confirm`, {})
      .pipe(map((res) => res.data));
  }
  override reject(id: string, request: RejectReturnRequest): Observable<ReturnRequest> {
    return this.http
      .post<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}/reject`, request)
      .pipe(map((res) => res.data));
  }
  override update(id: string, request: UpdateReturnRequest): Observable<ReturnRequest> {
    return this.http
      .patch<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}`, request)
      .pipe(map((res) => res.data));
  }
  override receive(id: string, request: ReceiveReturnRequest): Observable<ReturnRequest> {
    return this.http
      .post<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}/receive`, request)
      .pipe(map((res) => res.data));
  }
  override approveRefund(id: string, request: ApproveRefundRequest): Observable<ReturnRequest> {
    return this.http
      .post<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}/approve-refund`, request)
      .pipe(map((res) => res.data));
  }
  override complete(id: string): Observable<ReturnRequest> {
    return this.http
      .post<ApiResponse<ReturnRequest>>(`${this.base}/${encodeURIComponent(id)}/complete`, {})
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminWarrantyApi extends AdminWarrantyApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/warranty-requests`;

  override list(query: WarrantyListQuery): Observable<ApiPageResponse<WarrantyRequest>> {
    return this.http.get<ApiPageResponse<WarrantyRequest>>(this.base, { params: paramsOf(query) });
  }
  override get(id: string): Observable<WarrantyRequest> {
    return this.http
      .get<ApiResponse<WarrantyRequest>>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
  override accept(id: string): Observable<WarrantyRequest> {
    return this.http
      .post<ApiResponse<WarrantyRequest>>(`${this.base}/${encodeURIComponent(id)}/accept`, {})
      .pipe(map((res) => res.data));
  }
  override reject(id: string, request: RejectWarrantyRequest): Observable<WarrantyRequest> {
    return this.http
      .post<ApiResponse<WarrantyRequest>>(`${this.base}/${encodeURIComponent(id)}/reject`, request)
      .pipe(map((res) => res.data));
  }
  override updateStatus(
    id: string,
    request: UpdateWarrantyStatusRequest,
  ): Observable<WarrantyRequest> {
    return this.http
      .patch<ApiResponse<WarrantyRequest>>(`${this.base}/${encodeURIComponent(id)}/status`, request)
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminCustomerApi extends AdminCustomerApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/customers`;

  override list(query: AdminCustomerListQuery): Observable<ApiPageResponse<AdminCustomer>> {
    return this.http.get<ApiPageResponse<AdminCustomer>>(this.base, { params: paramsOf(query) });
  }
  override get(id: string): Observable<AdminCustomer> {
    return this.http
      .get<ApiResponse<AdminCustomer>>(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminDashboardApi extends AdminDashboardApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin`;

  override summary(): Observable<OrderDashboardSummary> {
    return this.http
      .get<ApiResponse<OrderDashboardSummary>>(`${this.base}/dashboard/orders`)
      .pipe(map((res) => res.data));
  }
  override lateCompensations(): Observable<LateCompensationRequest[]> {
    return this.http
      .get<ApiResponse<LateCompensationRequest[]>>(`${this.base}/late-compensation-requests`)
      .pipe(map((res) => res.data));
  }
  override approveCompensation(id: string): Observable<LateCompensationRequest> {
    return this.http
      .post<ApiResponse<LateCompensationRequest>>(
        `${this.base}/late-compensation-requests/${encodeURIComponent(id)}/approve`,
        {},
      )
      .pipe(map((res) => res.data));
  }
  override rejectCompensation(id: string, note: string): Observable<LateCompensationRequest> {
    return this.http
      .post<ApiResponse<LateCompensationRequest>>(
        `${this.base}/late-compensation-requests/${encodeURIComponent(id)}/reject`,
        { reason: note },
      )
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminReportApi extends AdminReportApi {
  private readonly http = inject(HttpClient);

  override get(period: ReportPeriod): Observable<OrderReport> {
    return this.http
      .get<ApiResponse<OrderReport>>(`${API_BASE}/admin/reports/orders`, {
        params: paramsOf({ period }),
      })
      .pipe(map((res) => res.data));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAdminChatApi extends AdminChatApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/admin/chat/sessions`;

  override sessions(status?: string): Observable<ChatSessionView[]> {
    return this.http
      .get<ApiResponse<{ sessions: ChatSessionView[] }>>(this.base, {
        params: paramsOf({ status }),
      })
      .pipe(map((res) => res.data.sessions));
  }
  override messages(
    sessionId: string,
  ): Observable<{ session: ChatSessionView; messages: ChatMessageView[] }> {
    return this.http
      .get<ApiResponse<{ session: ChatSessionView; messages: ChatMessageView[] }>>(
        `${this.base}/${encodeURIComponent(sessionId)}/messages`,
      )
      .pipe(map((res) => ({ session: res.data.session, messages: res.data.messages })));
  }
  override claim(sessionId: string): Observable<ChatSessionView> {
    return this.http
      .post<ApiResponse<{ session: ChatSessionView }>>(
        `${this.base}/${encodeURIComponent(sessionId)}/claim`,
        {},
      )
      .pipe(map((res) => res.data.session));
  }
  override send(sessionId: string, content: string): Observable<ChatMessageView> {
    return this.http
      .post<
        ApiResponse<{
          session: ChatSessionView;
          message: ChatMessageView;
          reply: ChatMessageView | null;
        }>
      >(`${this.base}/${encodeURIComponent(sessionId)}/messages`, { content })
      .pipe(map((res) => res.data.message));
  }
  override close(sessionId: string): Observable<ChatSessionView> {
    return this.http
      .post<ApiResponse<{ session: ChatSessionView }>>(
        `${this.base}/${encodeURIComponent(sessionId)}/close`,
        {},
      )
      .pipe(map((res) => res.data.session));
  }
}
