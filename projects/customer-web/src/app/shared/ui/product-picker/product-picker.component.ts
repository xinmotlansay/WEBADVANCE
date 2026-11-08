import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  CatalogApiService,
  type ProductDetail,
  type ProductSort,
  type ProductVariant,
} from 'shared';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';

export interface PickedProduct {
  product: ProductDetail;
  variant: ProductVariant;
}

const PAGE_SIZE = 12;

/**
 * Popup chọn sản phẩm thay thế: tìm kiếm, lọc theo danh mục, sắp xếp, phân trang;
 * bấm một sản phẩm để sang bước chọn màu / chất liệu rồi xác nhận.
 */
@Component({
  selector: 'app-product-picker',
  imports: [ReactiveFormsModule, IconComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-picker.component.html',
  styleUrl: './product-picker.component.css',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class ProductPickerComponent {
  private readonly api = inject(CatalogApiService);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Giá thực trả của sản phẩm cũ; sản phẩm/biến thể rẻ hơn mức này bị ẩn hoặc khóa. 0 = không giới hạn. */
  readonly minPrice = input(0);
  protected readonly onlyEligible = signal(true);
  protected readonly priceFloor = computed(() => (this.onlyEligible() ? this.minPrice() : 0));

  readonly picked = output<PickedProduct>();
  readonly closed = output<void>();

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly sort = signal<ProductSort | ''>('');
  protected readonly page = signal(1);
  protected readonly sorts: { value: ProductSort | ''; label: string }[] = [
    { value: '', label: 'Liên quan nhất' },
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price_asc', label: 'Giá thấp đến cao' },
    { value: 'price_desc', label: 'Giá cao đến thấp' },
  ];

  protected readonly categories = toSignal(
    this.api.getCategories('PRODUCT_CATEGORY').pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  /** `'idle'` chưa tìm gì (không tải sản phẩm), `undefined` đang tải, `null` lỗi. */
  protected readonly result = toSignal(
    toObservable(
      computed(() => ({
        q: this.query(),
        floor: this.priceFloor(),
        category: this.category(),
        sort: this.sort(),
        page: this.page(),
      })),
    ).pipe(
      switchMap(({ q, floor, category, sort, page }) =>
        !q && !category
          ? of('idle' as const)
          : this.api
          .getProducts({
            q: q || undefined,
            categoryIds: category ? [category] : undefined,
            minPrice: floor || undefined,
            sort: sort || undefined,
            inStock: true,
            page,
            limit: PAGE_SIZE,
          })
          .pipe(
            catchError(() => of(null)),
            startWith(undefined),
          ),
      ),
    ),
  );

  /** Sản phẩm đang xem biến thể (bước 2). */
  protected readonly slug = signal('');
  protected readonly variantId = signal('');
  protected readonly detail = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        slug
          ? this.api.getProduct(slug).pipe(
              map((p) => p as ProductDetail | null),
              catchError(() => of(null)),
              startWith(undefined),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );
  protected readonly chosenVariant = computed(
    () => this.detail()?.variants.find((v) => v.id === this.variantId()) ?? null,
  );

  constructor() {
    // Khóa cuộn trang phía sau khi popup đang mở.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (document.body.style.overflow = previousOverflow));
    afterNextRender(() => this.searchInput()?.nativeElement.focus());

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => {
        this.query.set(q.trim());
        this.page.set(1);
      });
  }

  protected toggleEligible(on: boolean): void {
    this.onlyEligible.set(on);
    this.page.set(1);
  }

  protected tooCheap(variant: ProductVariant): boolean {
    return variant.price.final < this.minPrice();
  }

  protected selectCategory(id: string): void {
    // Bấm lại danh mục đang chọn thì bỏ chọn.
    this.category.set(this.category() === id ? '' : id);
    this.page.set(1);
  }

  protected setSort(value: string): void {
    this.sort.set(value as ProductSort | '');
    this.page.set(1);
  }

  protected openProduct(slug: string): void {
    this.variantId.set('');
    this.slug.set(slug);
  }

  protected back(): void {
    this.slug.set('');
    this.variantId.set('');
  }

  protected confirm(): void {
    const product = this.detail();
    const variant = this.chosenVariant();
    if (product && variant && !this.tooCheap(variant)) this.picked.emit({ product, variant });
  }
}
