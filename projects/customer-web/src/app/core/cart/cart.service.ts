import { effect, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AccountReadApiService } from '../../features/account/account-read-api.service';

@Injectable({
  providedIn: 'root',
})
export class CartService {
  readonly itemCount = signal(0);

  constructor(private readonly accountApi: AccountReadApiService) {
    effect((onCleanup) => {
      const userId = this.accountApi.previewUserId();
      if (!userId) {
        this.itemCount.set(0);
        return;
      }
      const subscription = this.accountApi.getCart(userId).subscribe({
        next: ({ itemCount }) => this.itemCount.set(itemCount),
        error: (error: unknown) => console.error('Failed to load cart count from MongoDB:', error),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  add(variantId: string, quantity: number): Observable<{ itemCount: number }> {
    const userId = this.accountApi.getPreviewUserId();
    if (!userId) {
      throw new Error('Hãy chọn tài khoản demo trong mục Tài khoản của tôi trước khi thêm sản phẩm vào giỏ.');
    }
    return this.accountApi.addCartItem(userId, variantId, quantity).pipe(
      tap(({ itemCount }) => this.itemCount.set(itemCount)),
    );
  }
}
