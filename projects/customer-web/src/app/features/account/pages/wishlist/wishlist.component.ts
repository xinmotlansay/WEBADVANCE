import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { map, of } from 'rxjs';
import { RouterLink } from '@angular/router';
import { CatalogApiService, type ProductListItem } from 'shared';
import { apiErrorMessage } from '../../../../core/api-error';
import { VariantPickerService } from '../../../../services/cart/variant-picker.service';
import { AuthService } from '../../../../services/auth/auth.service';
import { CollectionWishlistService } from '../../../../services/cart/collection-wishlist.service';
import { AccountApiService } from '../../../../services/account/account-api.service';
import { AccountIconComponent } from '../../account-icon.component';

@Component({
  selector: 'app-wishlist',
  imports: [RouterLink, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.guest-wishlist]': 'guest()', '[class.account-area]': 'guest()' },
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.css',
})
export class WishlistComponent {
  private readonly api = inject(AccountApiService);
  private readonly picker = inject(VariantPickerService);
  private readonly wishlist = inject(CollectionWishlistService);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogApiService);
  /** Khách chưa đăng nhập: danh sách chỉ lưu tạm trong phiên. */
  protected readonly guest = computed(() => !this.auth.isAuthenticated());

  protected readonly products = signal<ProductListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);

  constructor() {
    const ids = this.wishlist.ids();
    const source = this.guest()
      ? ids.length
        ? this.catalog.getProducts({ ids, limit: 100 }).pipe(map((page) => page.items))
        : of([])
      : this.api.wishlist();
    source.subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected remove(product: ProductListItem): void {
    this.wishlist.toggle(product.id);
    this.products.update((items) => items.filter((item) => item.id !== product.id));
  }

  /** Mở popup chọn mẫu giống nút thêm giỏ ở thẻ sản phẩm. */
  protected addToCart(product: ProductListItem, mode: 'add' | 'buy' = 'add'): void {
    this.picker.open({ mode, slug: product.slug });
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }
}
