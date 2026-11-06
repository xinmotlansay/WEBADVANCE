import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse } from 'shared';
import { map, Observable } from 'rxjs';

const BASE = '/api/v1/admin/marketing/vouchers';

export type VoucherStatus = 'UPCOMING' | 'ACTIVE' | 'USED_UP' | 'EXPIRED' | 'DISABLED';

export interface VoucherRow {
  id: string;
  code: string;
  name?: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: number;
  maxDiscountValue: number | null;
  minOrderValue: number;
  usedCount: number;
  totalUsageLimit: number | null;
  startDate: string;
  endDate: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: VoucherStatus;
  flags: ('NEAR_LIMIT' | 'ENDING_SOON')[];
  version: number;
}

export interface ScopeItem {
  productId?: string;
  categoryId?: string;
}

export interface VoucherDetail extends VoucherRow {
  description: string;
  customerGroup: 'ALL' | 'NEW_CUSTOMER' | 'BIRTHDAY_MONTH' | 'ACCOUNT';
  stackableWithPromotion: boolean;
  scope: ScopeItem[];
  perUserLimit: number;
  disableReason: string | null;
  usageRefunded: number;
  totalDiscount: number;
}

export interface VoucherQuery {
  q?: string;
  status?: VoucherStatus | '';
  discountType?: string;
  visibility?: string;
  page: number;
  limit: number;
}

export interface VoucherPage {
  data: VoucherRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Thân tạo/sửa; khi sửa chỉ gửi trường đổi + `version`. */
export type VoucherBody = Record<string, unknown>;

export interface CategoryOption {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class VoucherApi {
  private readonly http = inject(HttpClient);

  list(q: VoucherQuery): Observable<VoucherPage> {
    let params = new HttpParams().set('page', q.page).set('limit', q.limit);
    for (const key of ['q', 'status', 'discountType', 'visibility'] as const) {
      if (q[key]) params = params.set(key, q[key]);
    }
    return this.http.get<VoucherPage & { success: boolean }>(BASE, { params });
  }

  get(id: string): Observable<VoucherDetail> {
    return this.http.get<ApiResponse<VoucherDetail>>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(body: VoucherBody): Observable<VoucherDetail> {
    return this.http.post<ApiResponse<VoucherDetail>>(BASE, body).pipe(map((r) => r.data));
  }

  update(id: string, body: VoucherBody): Observable<VoucherDetail> {
    return this.http
      .patch<ApiResponse<VoucherDetail>>(`${BASE}/${id}`, body)
      .pipe(map((r) => r.data));
  }

  disable(ids: string[], reason: string, note?: string): Observable<{ disabled: number }> {
    return this.http
      .post<ApiResponse<{ disabled: number }>>(`${BASE}/disable`, { ids, reason, note })
      .pipe(map((r) => r.data));
  }

  enable(id: string, reason: string): Observable<VoucherDetail> {
    return this.http
      .post<ApiResponse<VoucherDetail>>(`${BASE}/${id}/enable`, { reason })
      .pipe(map((r) => r.data));
  }

  /** Danh mục sản phẩm (route công khai) để chọn phạm vi áp dụng. */
  categories(): Observable<CategoryOption[]> {
    type Node = { id: string; name: string; children: Node[] };
    const flat = (nodes: Node[]): CategoryOption[] =>
      nodes.flatMap((n) => [{ id: n.id, name: n.name }, ...flat(n.children)]);
    return this.http
      .get<ApiResponse<Node[]>>('/api/v1/categories', { params: { type: 'PRODUCT_CATEGORY' } })
      .pipe(map((r) => flat(r.data)));
  }
}
