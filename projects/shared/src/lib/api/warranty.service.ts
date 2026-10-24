import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { ApiResponse, ApiPageResponse } from '../models/api-response.model';
import { WarrantyCard, WarrantySubmission, AfterSalesRequest } from '../models/after-sales.model';
@Injectable({ providedIn: 'root' })
export class WarrantyService {
  private readonly http = inject(HttpClient);
  cards(q = '') {
    return this.http
      .get<ApiResponse<WarrantyCard[]>>('/api/v1/warranty-cards', {
        params: new HttpParams().set('q', q),
      })
      .pipe(map((r) => r.data));
  }
  list(page = 1, status?: string) {
    return this.http.get<ApiPageResponse<AfterSalesRequest>>('/api/v1/warranty-requests', {
      params: { page, ...(status ? { status } : {}) },
    });
  }
  detail(id: string) {
    return this.http
      .get<ApiResponse<AfterSalesRequest>>(`/api/v1/warranty-requests/${encodeURIComponent(id)}`)
      .pipe(map((r) => r.data));
  }
  create(body: WarrantySubmission) {
    return this.http
      .post<ApiResponse<{ id: string; status: string }>>('/api/v1/warranty-requests', body)
      .pipe(map((r) => r.data));
  }
}
