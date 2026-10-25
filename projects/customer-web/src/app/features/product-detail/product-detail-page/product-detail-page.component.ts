import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap } from 'rxjs';
import { ProductDetailData, ProductDetailService } from '../product-detail.service';
import { CartService } from '../../../core/cart/cart.service';

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
  protected readonly selectedColorIndex = signal(0);
  protected readonly selectedImageIndex = signal(0);
  protected readonly selectedTab = signal<'description' | 'specifications'>('description');
  protected readonly quantity = signal(1);
  protected readonly favorite = signal(false);
  protected readonly notice = signal('');

  constructor(
    route: ActivatedRoute,
    productDetailService: ProductDetailService,
    private readonly cartService: CartService,
  ) {
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

        return productDetailService.getProduct(identifier).pipe(
          catchError((error: unknown) => {
            this.error.set(this.apiErrorMessage(error));
            return EMPTY;
          }),
          finalize(() => this.loading.set(false)),
        );
      }),
    ).subscribe((product) => {
      this.product.set(product);
      this.selectedColorIndex.set(0);
      this.selectedImageIndex.set(0);
    });
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002 và cấu hình proxy.';
      if (error.status === 404) return 'Không tìm thấy sản phẩm này trong MongoDB.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status >= 500) return 'MongoDB API trả lỗi máy chủ. Hãy kiểm tra kết nối database và collection caraveso/productVariants.';
    }
    return error instanceof Error ? error.message : 'Không tải được dữ liệu sản phẩm.';
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }

  protected selectColor(index: number): void {
    this.selectedColorIndex.set(index);
    this.selectedImageIndex.set(0);
  }

  protected decreaseQuantity(): void {
    this.quantity.update((current) => Math.max(1, current - 1));
  }

  protected increaseQuantity(): void {
    this.quantity.update((current) => current + 1);
  }

  protected toggleFavorite(): void {
    this.favorite.update((isFavorite) => !isFavorite);
    this.notice.set(this.favorite() ? 'Đã thêm sản phẩm vào danh sách yêu thích.' : 'Đã xóa sản phẩm khỏi danh sách yêu thích.');
  }

  protected addToCart(): void {
    this.cartService.add(this.quantity());
    this.notice.set(`Đã thêm ${this.quantity()} sản phẩm vào giỏ hàng.`);
  }

  protected buyNow(): void {
    this.cartService.add(this.quantity());
    this.notice.set('Sản phẩm đã sẵn sàng. Tiếp tục kết nối bước thanh toán khi có API giỏ hàng.');
  }

  protected showRoomPreview(feature: string): void {
    this.notice.set(`${feature} sẽ được mở khi tính năng trải nghiệm sản phẩm được kết nối.`);
  }

  protected toggleRelatedFavorite(name: string): void {
    this.notice.set(`Đã cập nhật danh sách yêu thích cho ${name}.`);
  }
}
