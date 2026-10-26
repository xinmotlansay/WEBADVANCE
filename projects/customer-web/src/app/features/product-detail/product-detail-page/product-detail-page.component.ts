import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap } from 'rxjs';
import { CartService } from '../../../core/cart/cart.service';
import { AccountProduct, AccountService } from '../../account/account.service';
import { ProductDetailData, ProductDetailService, productDetailErrorMessage } from '../product-detail.service';

@Component({
  selector: 'app-product-detail-page',
  imports: [RouterLink],
  templateUrl: './product-detail-page.component.html',
  styleUrl: './product-detail-page.component.css',
})
export class ProductDetailPageComponent {
  protected readonly product = signal<ProductDetailData | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selectedImageIndex = signal(0);
  protected readonly selectedColorIndex = signal(0);
  protected readonly quantity = signal(1);
  protected readonly selectedTab = signal<'description' | 'specifications'>('description');
  protected readonly notice = signal('');
  protected readonly cartSaving = signal(false);
  protected readonly relatedProducts;
  protected readonly reviews = [
    {
      name: 'Hoàng Huy Tiên',
      avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=120',
      rating: 5,
      date: '26/08/2026 11:43',
      variant: 'Sofa 2 chỗ, Trắng kem',
      comment: 'Mẫu đẹp, nhìn rất sang phù hợp decor phòng, thiết kế độc đáo.',
    },
    {
      name: 'Hoàng Huy Tiến',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=120',
      rating: 4,
      date: '20/08/2026 11:43',
      variant: 'Sofa 2 chỗ, Trắng kem',
      comment: 'Sản phẩm đẹp, chất liệu êm và giao hàng đúng hẹn.',
    },
  ];
  protected readonly reviewImage = 'https://images.pexels.com/photos/276534/pexels-photo-276534.jpeg?auto=compress&cs=tinysrgb&w=700';

  constructor(
    route: ActivatedRoute,
    productService: ProductDetailService,
    accountService: AccountService,
    private readonly cart: CartService,
  ) {
    this.relatedProducts = accountService.products;
    route.paramMap.pipe(
      switchMap((params) => {
        const identifier = params.get('id');
        this.product.set(null);
        this.error.set('');
        this.loading.set(true);
        if (!identifier) {
          this.error.set('Không tìm thấy mã sản phẩm trên đường dẫn.');
          this.loading.set(false);
          return EMPTY;
        }
        return productService.getProduct(identifier).pipe(
          catchError((error: unknown) => {
            this.error.set(productDetailErrorMessage(error));
            return EMPTY;
          }),
          finalize(() => this.loading.set(false)),
        );
      }),
    ).subscribe((product) => {
      this.product.set(product);
      this.selectedImageIndex.set(0);
      this.selectedColorIndex.set(0);
      this.selectedTab.set('description');
    });
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }

  protected currentPrice(): number {
    const product = this.product();
    return product?.colors[this.selectedColorIndex()]?.price ?? product?.price ?? 0;
  }

  protected changeColor(index: number): void {
    const product = this.product();
    if (!product) return;

    this.selectedColorIndex.set(index);
    this.selectedImageIndex.set(Math.max(0, product.images.indexOf(product.colors[index].image)));
  }

  protected decreaseQuantity(): void {
    this.quantity.update((value) => Math.max(1, value - 1));
  }

  protected increaseQuantity(): void {
    this.quantity.update((value) => value + 1);
  }

  protected addToCart(): void {
    if (this.cartSaving()) return;
    const selectedVariant = this.product()?.colors[this.selectedColorIndex()];
    if (!selectedVariant?.variantId) {
      this.notice.set('Sản phẩm này chưa có biến thể hợp lệ để thêm vào giỏ hàng.');
      return;
    }
    this.cartSaving.set(true);
    this.notice.set('');
    try {
      this.cart.add(selectedVariant.variantId, this.quantity()).pipe(
        finalize(() => this.cartSaving.set(false)),
      ).subscribe({
        next: () => this.notice.set(`Đã lưu ${this.quantity()} sản phẩm vào giỏ hàng MongoDB.`),
        error: (error: unknown) => this.notice.set(this.cartErrorMessage(error)),
      });
    } catch (error) {
      this.cartSaving.set(false);
      this.notice.set(error instanceof Error ? error.message : 'Không thể thêm sản phẩm vào giỏ hàng.');
    }
  }

  protected buyNow(): void {
    this.addToCart();
  }

  protected addRelatedToCart(product: AccountProduct): void {
    this.notice.set(`Không thể lưu ${product.name}: sản phẩm gợi ý chưa có mã biến thể MongoDB.`);
  }

  protected trackRelatedProduct(_: number, product: AccountProduct): number {
    return product.id;
  }

  private cartErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không lưu được giỏ hàng vào MongoDB.';
  }
}
