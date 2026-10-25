import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ApiPageResponse, ApiResponse } from '../models/api-response.model';
import {
  AfterSalesRequest,
  ReturnSubmission,
  OrderSummary,
  EligibleOrder,
} from '../models/after-sales.model';
@Injectable({ providedIn: 'root' })
export class ReturnExchangeService {
  private readonly http = inject(HttpClient);
  orders(page = 1) {
    return this.http.get<ApiPageResponse<OrderSummary>>('/api/v1/orders', {
      params: { status: 'DELIVERED', page, limit: 20 },
    });
  }
  order(id: string) {
    return this.http
      .get<ApiResponse<EligibleOrder>>(`/api/v1/orders/${encodeURIComponent(id)}`)
      .pipe(map((r) => r.data));
  }
  list(page = 1, status?: string) {
    return this.http.get<ApiPageResponse<AfterSalesRequest>>('/api/v1/return-requests', {
      params: { page, ...(status ? { status } : {}) },
    });
  }
  detail(id: string) {
    return this.http
      .get<ApiResponse<AfterSalesRequest>>(`/api/v1/return-requests/${encodeURIComponent(id)}`)
      .pipe(map((r) => r.data));
  }
  create(body: ReturnSubmission) {
    return this.http
      .post<ApiResponse<{ id: string; status: string }>>('/api/v1/return-requests', body)
      .pipe(map((r) => r.data));
  }
  cancel(id: string) {
    return this.http
      .post<ApiResponse<{ id: string; status: string }>>(
        `/api/v1/return-requests/${encodeURIComponent(id)}/cancel`,
        {},
      )
      .pipe(map((r) => r.data));
  }
}
