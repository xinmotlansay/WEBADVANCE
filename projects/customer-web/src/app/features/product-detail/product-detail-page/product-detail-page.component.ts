import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, Observable, Subscription, switchMap } from 'rxjs';
import { ProductDetailData, ProductDetailService, RelatedProduct, ReviewPage, StockStatus } from '../product-detail.service';
import { CartService } from '../../../core/cart/cart.service';
import { WishlistService } from '../../../core/wishlist/wishlist.service';

const MAX_QUANTITY = 99;
const REVIEWS_PER_PAGE = 5;
const MAX_REVIEW_LENGTH = 1000;
const STOCK_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'Còn hàng',
  LOW_STOCK: 'Sắp hết hàng',
  OUT_OF_STOCK: 'Tạm hết hàng',
};

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
  protected readonly selectedVariantIndex = signal(0);
  protected readonly selectedImageIndex = signal(0);
  protected readonly selectedTab = signal<'description' | 'specifications'>('description');
  protected readonly quantity = signal(1);
  protected readonly notice = signal<{ text: string; type: 'success' | 'error' } | null>(null);
  /** Khóa của thao tác đang gửi lên server, dùng để chặn bấm lặp. */
  protected readonly pendingAction = signal<string | null>(null);

  protected readonly relatedProducts = signal<RelatedProduct[]>([]);
  protected readonly relatedError = signal('');

  protected readonly reviews = signal<ReviewPage | null>(null);
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsError = signal('');
  protected readonly reviewFormOpen = signal(false);
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly maxReviewLength = MAX_REVIEW_LENGTH;
  protected readonly stockLabels = STOCK_LABELS;

  protected readonly selectedVariant = computed(() => this.product()?.variants[this.selectedVariantIndex()] ?? null);
  protected readonly isFavorite = computed(() => {
    const product = this.product();
    return product ? this.wishlist.productIds().has(product.id) : false;
  });
  protected readonly specifications = computed(() => {
    const product = this.product();
    const variant = this.selectedVariant();
    if (!product || !variant) return [];
    return [
      ...(variant.sku ? [{ label: 'SKU', value: variant.sku }] : []),
      { label: 'Màu sắc', value: variant.name },
      { label: 'Kích thước', value: variant.size },
      ...(variant.material ? [{ label: 'Chất liệu', value: variant.material }] : []),
      ...product.technicalDetails,
    ];
  });
  protected readonly reviewPages = computed(() => {
    const totalPages = this.reviews()?.totalPages ?? 0;
    const current = this.reviews()?.page ?? 1;
    const start = Math.max(1, Math.min(current - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  });

  private readonly relatedTrack = viewChild<ElementRef<HTMLElement>>('relatedTrack');
  private productIdentifier = '';
  private relatedSubscription = new Subscription();
  private reviewsSubscription = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly productDetailService: ProductDetailService,
    private readonly cartService: CartService,
    protected readonly wishlist: WishlistService,
  ) {
    wishlist.refresh();
    route.paramMap.pipe(
      switchMap((params) => {
        const identifier = params.get('id');
        this.resetForProduct(identifier ?? '');
        if (!identifier) {
          this.error.set('Không tìm thấy mã sản phẩm trên đường dẫn.');
          this.loading.set(false);
          return EMPTY;
        }

        return this.productDetailService.getProduct(identifier).pipe(
          catchError((error: unknown) => {
            this.error.set(this.apiErrorMessage(error));
            return EMPTY;
          }),
          finalize(() => this.loading.set(false)),
        );
      }),
    ).subscribe((product) => {
      this.product.set(product);
      // Đường dẫn có thể chỉ định sẵn biến thể: /products/sofa-da-milan?variant=100.002.02
      const requestedSku = this.route.snapshot.queryParamMap.get('variant');
      const requestedIndex = product.variants.findIndex((variant) => variant.sku === requestedSku);
      if (requestedIndex > 0) this.applyVariant(requestedIndex);
      this.loadRelatedProducts();
      this.loadReviews(1);
    });
  }

  private resetForProduct(identifier: string): void {
    this.relatedSubscription.unsubscribe();
    this.reviewsSubscription.unsubscribe();
    this.productIdentifier = identifier;
    this.product.set(null);
    this.error.set('');
    this.loading.set(true);
    this.notice.set(null);
    this.selectedVariantIndex.set(0);
    this.selectedImageIndex.set(0);
    this.selectedTab.set('description');
    this.quantity.set(1);
    this.relatedProducts.set([]);
    this.relatedError.set('');
    this.reviews.set(null);
    this.reviewsError.set('');
    this.reviewFormOpen.set(false);
    this.reviewRating.set(5);
    this.reviewComment.set('');
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002 và cấu hình proxy.';
      if (error.status === 404) return 'Không tìm thấy sản phẩm này trong MongoDB.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status >= 500) return 'MongoDB API trả lỗi máy chủ. Hãy kiểm tra log API, kết nối database caraveso và collection product_variants.';
    }
    return error instanceof Error ? error.message : 'Không tải được dữ liệu sản phẩm.';
  }

  private actionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Vui lòng thử lại.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return fallback;
  }

  /** Chạy một thao tác ghi dữ liệu, chặn bấm lặp và hiển thị kết quả. */
  private runAction<T>(key: string, request: Observable<T>, successText: (result: T) => string, errorText: string): void {
    if (this.pendingAction()) return;
    this.pendingAction.set(key);
    request.pipe(finalize(() => this.pendingAction.set(null))).subscribe({
      next: (result) => this.notice.set({ text: successText(result), type: 'success' }),
      error: (error: unknown) => this.notice.set({ text: this.actionErrorMessage(error, errorText), type: 'error' }),
    });
  }

  private loadRelatedProducts(): void {
    this.relatedSubscription = this.productDetailService.getRelatedProducts(this.productIdentifier).subscribe({
      next: (products) => this.relatedProducts.set(products),
      error: (error: unknown) => this.relatedError.set(this.actionErrorMessage(error, 'Không tải được sản phẩm tương tự.')),
    });
  }

  protected loadReviews(page: number): void {
    if (page < 1 || page > Math.max(1, this.reviews()?.totalPages ?? 1)) return;

    this.reviewsSubscription.unsubscribe();
    this.reviewsLoading.set(true);
    this.reviewsError.set('');
    this.reviewsSubscription = this.productDetailService
      .getReviews(this.productIdentifier, page, REVIEWS_PER_PAGE)
      .pipe(finalize(() => this.reviewsLoading.set(false)))
      .subscribe({
        next: (reviews) => this.reviews.set(reviews),
        error: (error: unknown) => this.reviewsError.set(this.actionErrorMessage(error, 'Không tải được đánh giá sản phẩm.')),
      });
  }

  protected formatPrice(price: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  }

  protected selectVariant(index: number): void {
    this.applyVariant(index);
    const sku = this.selectedVariant()?.sku;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: index > 0 && sku ? sku : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private applyVariant(index: number): void {
    this.selectedVariantIndex.set(index);
    // Biến thể chưa có ảnh riêng thì giữ nguyên ảnh đang xem.
    const imageIndex = this.product()?.variants[index]?.imageIndex ?? -1;
    if (imageIndex >= 0) this.selectedImageIndex.set(imageIndex);
  }

  protected decreaseQuantity(): void {
    this.quantity.update((current) => Math.max(1, current - 1));
  }

  protected increaseQuantity(): void {
    this.quantity.update((current) => Math.min(MAX_QUANTITY, current + 1));
  }

  protected toggleFavorite(): void {
    const product = this.product();
    if (product) this.toggleWishlist(product.id, product.name);
  }

  protected toggleRelatedFavorite(related: RelatedProduct): void {
    this.toggleWishlist(related.id, related.name);
  }

  private toggleWishlist(productId: string, name: string): void {
    this.runAction(
      `wishlist:${productId}`,
      this.wishlist.toggle(productId),
      (wishlisted) => wishlisted ? `Đã thêm ${name} vào danh sách yêu thích.` : `Đã xóa ${name} khỏi danh sách yêu thích.`,
      'Không cập nhật được danh sách yêu thích.',
    );
  }

  protected addToCart(): void {
    const variant = this.selectedVariant();
    if (!variant) return;
    const quantity = this.quantity();
    this.runAction(
      'cart',
      this.cartService.addItem(variant.variantId, quantity),
      (cart) => `Đã thêm ${quantity} sản phẩm (${variant.name}) vào giỏ hàng. Giỏ hàng hiện có ${cart.totalQuantity} sản phẩm.`,
      'Không thêm được sản phẩm vào giỏ hàng.',
    );
  }

  protected buyNow(): void {
    const variant = this.selectedVariant();
    if (!variant) return;
    this.runAction(
      'buy',
      this.cartService.addItem(variant.variantId, this.quantity(), { select: true }),
      () => 'Sản phẩm đã được thêm và chọn sẵn trong giỏ hàng để thanh toán.',
      'Không thể mua nhanh sản phẩm này.',
    );
  }

  protected addRelatedToCart(related: RelatedProduct, buyNow = false): void {
    this.runAction(
      `${buyNow ? 'buy' : 'cart'}:${related.id}`,
      this.cartService.addItem(related.variantId, 1, { select: buyNow ? true : undefined }),
      () => buyNow ? `${related.name} đã được chọn sẵn trong giỏ hàng để thanh toán.` : `Đã thêm ${related.name} vào giỏ hàng.`,
      'Không thêm được sản phẩm vào giỏ hàng.',
    );
  }

  protected scrollRelated(direction: 1 | -1): void {
    const track = this.relatedTrack()?.nativeElement;
    track?.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
  }

  protected showRoomPreview(feature: string): void {
    this.notice.set({ text: `${feature} sẽ được mở khi tính năng trải nghiệm sản phẩm được kết nối.`, type: 'success' });
  }

  protected updateReviewComment(event: Event): void {
    this.reviewComment.set((event.target as HTMLTextAreaElement).value);
  }

  protected submitReview(event: Event): void {
    event.preventDefault();
    const comment = this.reviewComment().trim();
    if (comment.length > MAX_REVIEW_LENGTH || this.pendingAction()) return;

    this.pendingAction.set('review');
    this.productDetailService
      .createReview(this.productIdentifier, {
        rating: this.reviewRating(),
        comment,
        variantId: this.selectedVariant()?.variantId,
      })
      .pipe(finalize(() => this.pendingAction.set(null)))
      .subscribe({
        next: () => {
          this.reviewFormOpen.set(false);
          this.reviewRating.set(5);
          this.reviewComment.set('');
          this.notice.set({ text: 'Cảm ơn bạn! Đánh giá đã được đăng.', type: 'success' });
          this.loadReviews(1);
        },
        error: (error: unknown) =>
          this.notice.set({ text: this.actionErrorMessage(error, 'Không gửi được đánh giá.'), type: 'error' }),
      });
  }
}
