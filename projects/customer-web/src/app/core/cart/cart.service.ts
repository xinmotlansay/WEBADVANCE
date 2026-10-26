import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api/api-url';

export interface CartLine {
  _id: string;
  variantId: string;
  quantity: number;
  isSelected: boolean;
  priceAtAdd: number;
  currentPrice: number | null;
  product: { _id: string; name: string; slug: string; thumbnail: string | null } | null;
  variant: { sku: string; color?: string; status: string } | null;
}

export interface Cart {
  _id: string | null;
  items: CartLine[];
  totalQuantity: number;
  subtotal: number;
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  readonly itemCount = signal(0);

  constructor(private readonly http: HttpClient) {}

  refresh(): void {
    this.http.get<Cart>(`${API_BASE_URL}/cart`).subscribe({
      next: (cart) => this.itemCount.set(cart.totalQuantity),
      // Huy hiệu giỏ hàng chỉ là thông tin phụ: lỗi tải không chặn trang.
      error: () => this.itemCount.set(0),
    });
  }

  /** `select: true` đánh dấu dòng được chọn để thanh toán (dùng cho "Mua nhanh"). */
  addItem(variantId: string, quantity: number, options: { select?: boolean } = {}): Observable<Cart> {
    return this.http
      .post<Cart>(`${API_BASE_URL}/cart/items`, { variantId, quantity, isSelected: options.select })
      .pipe(tap((cart) => this.itemCount.set(cart.totalQuantity)));
  }
}
