import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CartApiService,
  type AddCartItemRequest,
  type Cart,
  type UpdateCartItemRequest,
} from 'shared';
import { firstValueFrom, type Observable } from 'rxjs';

/**
 * Giỏ hàng dùng chung cho header (badge), popup chọn biến thể và trang giỏ.
 * Mọi thao tác thay toàn bộ giỏ bằng response của server; lỗi ném ra để nơi gọi báo cho khách.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly api = inject(CartApiService);

  readonly cart = signal<Cart | null>(null);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** BR-C09: badge là số dòng trong giỏ. */
  readonly count = computed(() => this.cart()?.items.length ?? 0);
  readonly badge = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
  readonly label = computed(() =>
    this.count() > 0 ? `Giỏ hàng, ${this.count()} sản phẩm` : 'Giỏ hàng',
  );

  load(): void {
    this.status.set('loading');
    this.api.get().subscribe({
      next: (cart) => {
        this.cart.set(cart);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  /** Tải lần đầu nếu chưa có dữ liệu (header gọi khi khởi động). */
  ensureLoaded(): void {
    if (this.status() === 'idle') this.load();
  }

  add(body: AddCartItemRequest): Promise<Cart> {
    return this.apply(this.api.addItem(body));
  }

  update(itemId: string, body: UpdateCartItemRequest): Promise<Cart> {
    return this.apply(this.api.updateItem(itemId, body));
  }

  remove(itemId: string): Promise<Cart> {
    return this.apply(this.api.removeItem(itemId));
  }

  setSelection(isSelected: boolean, itemIds?: string[]): Promise<Cart> {
    return this.apply(this.api.setSelection(isSelected, itemIds));
  }

  private async apply(request: Observable<Cart>): Promise<Cart> {
    const cart = await firstValueFrom(request);
    this.cart.set(cart);
    this.status.set('ready');
    return cart;
  }
}
