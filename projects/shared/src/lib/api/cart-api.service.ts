import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiResponse } from '../models/api-response.model';
import type { AddCartItemRequest, Cart, UpdateCartItemRequest } from '../models/cart.model';

const API_BASE = '/api/v1/cart';

/** API giỏ hàng (API Design mục 7). Mọi thao tác trả lại toàn bộ giỏ. */
@Injectable({ providedIn: 'root' })
export class CartApiService {
  private readonly http = inject(HttpClient);

  get(): Observable<Cart> {
    return this.http.get<ApiResponse<Cart>>(API_BASE).pipe(map((r) => r.data));
  }

  addItem(body: AddCartItemRequest): Observable<Cart> {
    return this.http.post<ApiResponse<Cart>>(`${API_BASE}/items`, body).pipe(map((r) => r.data));
  }

  updateItem(itemId: string, body: UpdateCartItemRequest): Observable<Cart> {
    return this.http
      .patch<ApiResponse<Cart>>(`${API_BASE}/items/${itemId}`, body)
      .pipe(map((r) => r.data));
  }

  removeItem(itemId: string): Observable<Cart> {
    return this.http
      .delete<ApiResponse<Cart>>(`${API_BASE}/items/${itemId}`)
      .pipe(map((r) => r.data));
  }

  /** Bỏ `itemIds` là chọn/bỏ chọn tất cả. */
  setSelection(isSelected: boolean, itemIds?: string[]): Observable<Cart> {
    return this.http
      .patch<ApiResponse<Cart>>(`${API_BASE}/selection`, { isSelected, itemIds })
      .pipe(map((r) => r.data));
  }
}
