import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiResponse } from '../models/api-response.model';
import type {
  CancelOrderRequest,
  CheckoutPreview,
  CheckoutRequest,
  CreateOrderRequest,
  OrderDetail,
  OrderPayment,
} from '../models/order.model';

const API_BASE = '/api/v1';

/** Thanh toán và đơn hàng (API Design mục 3, 8). */
@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);

  preview(body: CheckoutRequest): Observable<CheckoutPreview> {
    return this.http
      .post<ApiResponse<CheckoutPreview>>(`${API_BASE}/checkout/preview`, body)
      .pipe(map((r) => r.data));
  }

  /** `idempotencyKey` sinh một lần khi vào trang, giữ nguyên khi bấm lại. */
  create(body: CreateOrderRequest, idempotencyKey: string): Observable<OrderPayment> {
    return this.http
      .post<ApiResponse<OrderPayment>>(`${API_BASE}/orders`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .pipe(map((r) => r.data));
  }

  get(id: string): Observable<OrderDetail> {
    return this.http
      .get<ApiResponse<OrderDetail>>(`${API_BASE}/orders/${id}`)
      .pipe(map((r) => r.data));
  }

  getPayment(id: string): Observable<OrderPayment> {
    return this.http
      .get<ApiResponse<OrderPayment>>(`${API_BASE}/orders/${id}/payment`)
      .pipe(map((r) => r.data));
  }

  cancel(id: string, body: CancelOrderRequest): Observable<OrderPayment> {
    return this.http
      .post<ApiResponse<OrderPayment>>(`${API_BASE}/orders/${id}/cancel`, body)
      .pipe(map((r) => r.data));
  }
}
