import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api/api-url';

@Injectable({
  providedIn: 'root',
})
export class WishlistService {
  readonly productIds = signal<ReadonlySet<string>>(new Set());

  constructor(private readonly http: HttpClient) {}

  refresh(): void {
    this.http.get<{ productIds: string[] }>(`${API_BASE_URL}/wishlist`).subscribe({
      next: ({ productIds }) => this.productIds.set(new Set(productIds)),
      error: () => this.productIds.set(new Set()),
    });
  }

  has(productId: string): boolean {
    return this.productIds().has(productId);
  }

  /** Trả về trạng thái yêu thích mới sau khi server xác nhận. */
  toggle(productId: string): Observable<boolean> {
    const request = this.has(productId)
      ? this.http.delete<{ wishlisted: boolean }>(`${API_BASE_URL}/wishlist/${encodeURIComponent(productId)}`)
      : this.http.post<{ wishlisted: boolean }>(`${API_BASE_URL}/wishlist`, { productId });

    return request.pipe(
      map(({ wishlisted }) => wishlisted),
      tap((wishlisted) =>
        this.productIds.update((ids) => {
          const next = new Set(ids);
          if (wishlisted) next.add(productId);
          else next.delete(productId);
          return next;
        }),
      ),
    );
  }
}
