import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../../../core/cart/cart.service';
import { AccountReadApiService, MongoWishlistItem } from '../../../features/account/account-read-api.service';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-wishlist',
  imports: [RouterLink, IconComponent],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.css',
})
export class WishlistComponent {
  protected readonly products = signal<MongoWishlistItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected notice = '';
  protected noticeIsError = false;
  protected busyProductId = '';
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService, private readonly cart: CartService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) {
      this.needsAccountId.set(true);
      return;
    }
    this.loading.set(true);
    accountApi.getWishlist(this.userId).subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected remove(product: MongoWishlistItem): void {
    this.busyProductId = product.productId;
    this.accountApi.removeWishlistItem(this.userId, product.productId).subscribe({
      next: () => {
        this.busyProductId = '';
        this.products.update((items) => items.filter((item) => item.productId !== product.productId));
        this.showNotice(`Đã bỏ ${product.name} khỏi danh sách yêu thích.`);
      },
      error: (error: unknown) => {
        this.busyProductId = '';
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected addToCart(product: MongoWishlistItem): void {
    if (!product.variantId) return;
    this.busyProductId = product.productId;
    this.cart.add(product.variantId, 1).subscribe({
      next: () => {
        this.busyProductId = '';
        this.showNotice(`Đã thêm ${product.name} vào giỏ hàng.`);
      },
      error: (error: unknown) => {
        this.busyProductId = '';
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }

  private showNotice(message: string, isError = false): void {
    this.notice = message;
    this.noticeIsError = isError;
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không thực hiện được thao tác.';
  }
}
