import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CatalogApiService,
  type ProductDetail,
  type ProductListItem,
  type ProductReviewPage,
  type StockStatus,
} from 'shared';
import { catchError, of, switchMap, tap } from 'rxjs';
import { saveBuyNow } from '../../core/cart/buy-now';
import { CartStore } from '../../core/cart/cart.store';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { AccountApiService } from '../account/account-api.service';
import { CollectionWishlistService } from '../../core/shopping/collection-wishlist.service';
import { DimensionDrawingComponent } from '../../shared/ui/dimension-drawing/dimension-drawing.component';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { ProductCardComponent } from '../../shared/ui/product-card/product-card.component';
import { ScrollCarouselComponent } from '../../shared/ui/scroll-carousel/scroll-carousel.component';
import { variantSwatch } from './variant-colors';

const MAX_QUANTITY = 99;
const REVIEWS_PER_PAGE = 5;
const RELATED_LIMIT = 9;
const STOCK_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'Còn hàng',
  LOW_STOCK: 'Sắp hết hàng',
  OUT_OF_STOCK: 'Tạm hết hàng',
};

interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: string;
}

interface VariantOption {
  variantId: string;
  name: string;
  sku: string;
  /** Ảnh riêng của biến thể, null nếu chỉ dùng ảnh chung. */
  thumbnail: string | null;
  swatch: string;
  /** Vị trí ảnh riêng của biến thể trong `images`, -1 nếu dùng ảnh chung. */
  imageIndex: number;
  price: number;
  originalPrice: number | null;
  size: string;
  material: string;
  stockStatus: StockStatus;
  /** Kích thước cả sản phẩm của biến thể, dùng vẽ bản vẽ kỹ thuật. */
  dimensions: Dimensions | null;
}

interface DetailView {
  id: string;
  slug: string;
  name: string;
  categories: { id: string; name: string }[];
  variants: VariantOption[];
  images: string[];
  description: string[];
  packageContents: string;
  /** Những gì có trong hộp: các bộ phận của sản phẩm, hoặc chính sản phẩm khi chưa khai báo bộ phận. */
  box: { isProduct: boolean; name: string; description: string; quantity: number; image: string }[];
  technicalDetails: { label: string; value: string }[];
}

function formatDimensions(
  dimensions: { length?: number; width?: number; height?: number; unit: string } | null | undefined,
  fallback = 'Thông tin đang cập nhật',
): string {
  const size = [dimensions?.length, dimensions?.width, dimensions?.height]
    .filter((value) => value !== undefined)
    .join(' × ');
  return size ? `${size} ${dimensions?.unit ?? 'cm'}` : fallback;
}

/** Định dạng `dd/MM/yyyy HH:mm` theo thiết kế. */
function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Đủ cả ba chiều thì mới vẽ được; thiếu chiều nào coi như chưa có kích thước. */
function toDimensions(
  value: { length?: number; width?: number; height?: number; unit: string } | null | undefined,
): Dimensions {
  return {
    length: value?.length ?? 0,
    width: value?.width ?? 0,
    height: value?.height ?? 0,
    unit: value?.unit ?? 'cm',
  };
}

function toView(detail: ProductDetail): DetailView {
  const images = detail.media
    .filter((media) => media.type === 'IMAGE' && media.url)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((media) => media.url);
  if (detail.thumbnail && !images.includes(detail.thumbnail)) images.push(detail.thumbnail);

  const variants = detail.variants.map((variant, index): VariantOption => {
    const own = detail.media.find(
      (media) => media.type === 'IMAGE' && media.variantId === variant.id,
    )?.url;
    const name = variant.color?.trim() || `Phiên bản ${index + 1}`;
    return {
      variantId: variant.id,
      name,
      sku: variant.sku,
      thumbnail: own ?? null,
      swatch: variantSwatch(name),
      imageIndex: own ? images.indexOf(own) : -1,
      price: variant.price.final,
      originalPrice: variant.price.original > variant.price.final ? variant.price.original : null,
      size: formatDimensions(variant.dimensions),
      material: variant.material,
      stockStatus: variant.stockStatus,
      dimensions: toDimensions(variant.dimensions),
    };
  });

  const technicalDetails: DetailView['technicalDetails'] = [];
  if (detail.productCode)
    technicalDetails.push({ label: 'Mã sản phẩm', value: detail.productCode });
  if (detail.warranty?.months)
    technicalDetails.push({ label: 'Bảo hành', value: `${detail.warranty.months} tháng` });
  if (detail.warranty?.terms)
    technicalDetails.push({ label: 'Điều kiện bảo hành', value: detail.warranty.terms });

  const paragraphs = [detail.shortDescription, ...(detail.description ?? '').split(/\n+/)]
    .map((paragraph) => paragraph?.trim())
    .filter((paragraph): paragraph is string => Boolean(paragraph));

  return {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    categories: detail.categories.map((category) => ({ id: category.id, name: category.name })),
    variants,
    images,
    description: [...new Set(paragraphs)],
    packageContents: detail.parts.length
      ? `Bộ sản phẩm gồm: ${detail.parts.map((part) => `${part.quantity ?? 1} ${part.name}`).join(', ')}.`
      : 'Thông tin thành phần đóng gói chưa được cập nhật.',
    box: detail.parts.length
      ? detail.parts.map((part) => ({
          isProduct: false,
          name: part.name,
          description: part.description,
          quantity: part.quantity ?? 1,
          image: part.image,
        }))
      : [{ isProduct: true, name: detail.name, description: '', quantity: 1, image: '' }],
    technicalDetails,
  };
}

@Component({
  selector: 'app-product-detail',
  imports: [
    FormsModule,
    RouterLink,
    DimensionDrawingComponent,
    IconComponent,
    ProductCardComponent,
    ScrollCarouselComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css',
})
export class ProductDetailComponent {
  private readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cart = inject(CartStore);
  protected readonly wishlist = inject(CollectionWishlistService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly accountApi = inject(AccountApiService);
  /** Đánh giá đang mở ô báo cáo vi phạm (FR-21). */
  protected readonly reportingId = signal('');
  protected reportReason = '';

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selectedVariantIndex = signal(0);
  protected readonly selectedImageIndex = signal(0);
  protected readonly selectedTab = signal<'description' | 'specifications'>('description');
  protected readonly quantity = signal(1);
  protected readonly notice = signal<{ text: string; type: 'success' | 'error' } | null>(null);
  /** Khóa thao tác đang gửi lên server, dùng để chặn bấm lặp. */
  protected readonly pendingAction = signal<string | null>(null);
  protected readonly stockLabels = STOCK_LABELS;

  protected readonly relatedProducts = signal<ProductListItem[]>([]);
  protected readonly reviews = signal<ProductReviewPage | null>(null);
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsError = signal('');

  protected readonly product = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => {
        this.resetState();
        return this.api.getProduct(params.get('slug') ?? '').pipe(
          tap((detail) => {
            this.loading.set(false);
            this.loadRelated(detail);
            this.loadReviews(1, detail.id);
            const sku = this.route.snapshot.queryParamMap.get('variant');
            const index = detail.variants.findIndex((variant) => variant.sku === sku);
            if (index > 0) this.applyVariant(index, toView(detail));
          }),
          catchError((error: unknown) => {
            this.loading.set(false);
            this.error.set(apiErrorMessage(error));
            return of(null);
          }),
        );
      }),
    ),
    { initialValue: null },
  );
  protected readonly view = computed(() => {
    const detail = this.product();
    return detail ? toView(detail) : null;
  });
  protected readonly selectedVariant = computed(
    () => this.view()?.variants[this.selectedVariantIndex()] ?? null,
  );
  protected readonly isFavorite = computed(() => {
    const view = this.view();
    return view ? this.wishlist.ids().includes(view.id) : false;
  });
  /** Mục trong hộp kèm bản vẽ kích thước theo biến thể đang chọn (không có bộ phận thì vẽ cả sản phẩm). */
  protected readonly boxItems = computed(() => {
    const view = this.view();
    const variant = this.selectedVariant();
    if (!view) return [];
    return view.box.map((item) => {
      // Số đo từng bộ phận là dữ liệu nội bộ (API Design 5.2): chỉ vẽ bản vẽ cho cả sản phẩm.
      const dimensions = item.isProduct ? variant?.dimensions : undefined;
      const drawable =
        dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0;
      return { ...item, dimensions: drawable ? dimensions : null };
    });
  });
  protected readonly rating = computed(
    () => this.product()?.ratingSummary ?? { average: 0, count: 0 },
  );
  protected readonly specifications = computed(() => {
    const view = this.view();
    const variant = this.selectedVariant();
    if (!view || !variant) return [];
    return [
      ...(variant.sku ? [{ label: 'SKU', value: variant.sku }] : []),
      { label: 'Màu sắc', value: variant.name },
      { label: 'Kích thước', value: variant.size },
      ...(variant.material ? [{ label: 'Chất liệu', value: variant.material }] : []),
      ...view.technicalDetails,
    ];
  });
  protected readonly reviewPages = computed(() => {
    const totalPages = this.reviews()?.totalPages ?? 0;
    const current = this.reviews()?.page ?? 1;
    const start = Math.max(1, Math.min(current - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  });

  private resetState(): void {
    this.loading.set(true);
    this.error.set('');
    this.notice.set(null);
    this.selectedVariantIndex.set(0);
    this.selectedImageIndex.set(0);
    this.selectedTab.set('description');
    this.quantity.set(1);
    this.relatedProducts.set([]);
    this.reviews.set(null);
    this.reviewsError.set('');
  }

  /** Sản phẩm tương tự: cùng danh mục, bỏ chính nó. */
  private loadRelated(detail: ProductDetail): void {
    const category = detail.categories.at(-1);
    if (!category) return;
    this.api.getProducts({ categoryIds: [category.id], limit: RELATED_LIMIT + 1 }).subscribe({
      next: (page) =>
        this.relatedProducts.set(
          page.items.filter((item) => item.id !== detail.id).slice(0, RELATED_LIMIT),
        ),
      error: () => this.relatedProducts.set([]),
    });
  }

  protected loadReviews(page: number, productId = this.product()?.id ?? ''): void {
    if (!productId || page < 1) return;
    this.reviewsLoading.set(true);
    this.reviewsError.set('');
    this.api.getProductReviews(productId, page, REVIEWS_PER_PAGE).subscribe({
      next: (result) => {
        this.reviews.set(result);
        this.reviewsLoading.set(false);
      },
      error: () => {
        this.reviewsError.set('Không tải được đánh giá sản phẩm.');
        this.reviewsLoading.set(false);
      },
    });
  }

  protected reviewVariantLabel(review: ProductReviewPage['items'][number]): string {
    return [
      review.variant?.color,
      review.variant ? formatDimensions(review.variant.dimensions, '') : '',
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected reviewDate(value: string): string {
    return formatReviewDate(value);
  }

  protected openReport(reviewId: string): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.reportReason = '';
    this.reportingId.set(this.reportingId() === reviewId ? '' : reviewId);
  }

  protected submitReport(reviewId: string): void {
    const reason = this.reportReason.trim();
    if (!reason) return;
    this.accountApi.reportReview(reviewId, reason).subscribe({
      next: () => {
        this.reportingId.set('');
        this.toast.success('Đã gửi báo cáo. Cảm ơn bạn!');
      },
      error: (error: unknown) => this.toast.error(apiErrorMessage(error)),
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

  private applyVariant(index: number, view = this.view()): void {
    this.selectedVariantIndex.set(index);
    // Biến thể chưa có ảnh riêng thì giữ nguyên ảnh đang xem.
    const imageIndex = view?.variants[index]?.imageIndex ?? -1;
    if (imageIndex >= 0) this.selectedImageIndex.set(imageIndex);
  }

  protected decreaseQuantity(): void {
    this.quantity.update((current) => Math.max(1, current - 1));
  }

  protected increaseQuantity(): void {
    this.quantity.update((current) => Math.min(MAX_QUANTITY, current + 1));
  }

  protected toggleFavorite(): void {
    const view = this.view();
    if (view) this.wishlist.toggle(view.id);
  }

  protected async addToCart(): Promise<void> {
    const variant = this.selectedVariant();
    if (!variant || this.pendingAction()) return;
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const quantity = this.quantity();
    this.pendingAction.set('cart');
    try {
      await this.cart.add({ variantId: variant.variantId, quantity, hasInstallation: false });
      this.notice.set({
        text: `Đã thêm ${quantity} sản phẩm (${variant.name}) vào giỏ hàng.`,
        type: 'success',
      });
    } catch (error) {
      this.notice.set({ text: apiErrorMessage(error), type: 'error' });
    } finally {
      this.pendingAction.set(null);
    }
  }

  protected buyNow(): void {
    const variant = this.selectedVariant();
    if (!variant) return;
    saveBuyNow([
      { variantId: variant.variantId, quantity: this.quantity(), hasInstallation: false },
    ]);
    void this.router.navigate(['/checkout'], { queryParams: { source: 'buy-now' } });
  }
}
