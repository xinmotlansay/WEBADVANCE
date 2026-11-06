import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/promotions';

export type PromotionStatus = 'DRAFT' | 'UPCOMING' | 'RUNNING' | 'PAUSED' | 'ENDED';
export type DiscountType = 'PERCENT' | 'FIXED_AMOUNT';

export interface PromotionRow {
  id: string;
  code: string;
  name: string;
  scopeType: 'PRODUCT' | 'CATEGORY';
  discountType: DiscountType | null;
  discountValue: number | null;
  maxDiscountValue: number | null;
  scopeCount: number;
  startDate: string | null;
  endDate: string | null;
  status: PromotionStatus;
  version: number;
  orderCount: number;
  flags: string[];
}

export interface PromotionLine {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  price: number;
  promoPrice: number;
  percent: number;
  warnings: string[];
  priceChangedFrom: number | null;
}

export interface PromotionDetail extends Omit<PromotionRow, 'orderCount' | 'flags'> {
  description: string;
  productIds: string[];
  categoryIds: string[];
  excludedProductIds: string[];
  pauseReason: string | null;
  canDelete: boolean;
  orderCount: number;
  totalDiscount: number;
  flags: string[];
  lines: PromotionLine[];
  linesTruncated: boolean;
  unchanged?: boolean;
}

export interface PromotionQuery {
  q?: string;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface PromotionPage {
  data: PromotionRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PreviewLine {
  variantId: string;
  productName?: string;
  sku: string;
  price: number;
  finalPrice: number;
  percent: number;
}

export interface ProductOption {
  id: string;
  name: string;
  priceFrom: number;
}

export type PromotionBody = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class PromotionApi {
  private readonly http = inject(HttpClient);

  list(q: PromotionQuery): Observable<PromotionPage> {
    let params = new HttpParams().set('page', q.page).set('limit', q.limit);
    for (const key of ['q', 'type', 'status', 'from', 'to'] as const)
      if (q[key]) params = params.set(key, q[key]!);
    return this.http.get<PromotionPage>(BASE, { params });
  }

  get(id: string): Observable<PromotionDetail> {
    return this.http.get<ApiResponse<PromotionDetail>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: PromotionBody): Observable<PromotionDetail> {
    return this.http.post<ApiResponse<PromotionDetail>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: PromotionBody): Observable<PromotionDetail> {
    return this.http
      .patch<ApiResponse<PromotionDetail>>(`${BASE}/${id}`, body)
      .pipe(map((r) => r.data));
  }

  preview(
    body: PromotionBody,
  ): Observable<{ lines: PreviewLine[]; total: number; needsConfirm: boolean }> {
    return this.http
      .post<ApiResponse<{ lines: PreviewLine[]; total: number; needsConfirm: boolean }>>(
        `${BASE}/preview`,
        body,
      )
      .pipe(map((r) => r.data));
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${BASE}/${id}`);
  }

  action(id: string, name: 'duplicate' | 'deactivate' | 'resume'): Observable<PromotionDetail> {
    return this.http
      .post<ApiResponse<PromotionDetail>>(`${BASE}/${id}/${name}`, {})
      .pipe(map((r) => r.data));
  }

  pause(id: string, reason: string, note?: string): Observable<PromotionDetail> {
    return this.http
      .post<ApiResponse<PromotionDetail>>(`${BASE}/${id}/pause`, { reason, note })
      .pipe(map((r) => r.data));
  }

  end(ids: string[], reason: string, note?: string): Observable<{ ended: number }> {
    return this.http
      .post<ApiResponse<{ ended: number }>>(`${BASE}/end`, { ids, reason, note })
      .pipe(map((r) => r.data));
  }

  /** Tìm sản phẩm đang bán (route công khai, chỉ đọc). */
  products(opts: { q?: string; ids?: string[] }): Observable<ProductOption[]> {
    let params = new HttpParams().set('limit', 100);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.ids?.length) params = params.set('ids', opts.ids.join(','));
    return this.http
      .get<{ data: ProductOption[] }>('/api/v1/products', { params })
      .pipe(map((r) => r.data));
  }
}
