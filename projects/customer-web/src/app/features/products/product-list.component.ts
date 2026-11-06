import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ElementRef,
  viewChild,
  computed,
  input,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CatalogApiService,
  ProductListItem,
  PageMeta,
  ProductListQuery,
  ProductFacets,
  ProductSort,
  Category,
  type Banner,
} from 'shared';
import {
  catchError,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  combineLatest,
  timer,
  distinctUntilChanged,
} from 'rxjs';
import { ProductCardComponent } from '../../shared/ui/product-card/product-card.component';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { PriceRangeComponent } from './price-range.component';
import { ImageSearchResultsService } from '../../core/search/image-search-results.service';
import { SearchUiService } from '../../core/search/search-ui.service';

interface Result {
  items: ProductListItem[];
  meta: PageMeta;
  loading: boolean;
  error: boolean;
}
const EMPTY: Result = {
  items: [],
  meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
  loading: true,
  error: false,
};
const PRICE_FORMATTER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

import { LinkDirective } from '../../shared/ui/link/link.directive';
import { BannerTrackerService } from '../../core/marketing/banner-tracker.service';

@Component({
  selector: 'app-product-list',
  imports: [
    LinkDirective,
    ProductCardComponent,
    ReactiveFormsModule,
    RouterLink,
    IconComponent,
    PriceRangeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded-list]': 'embedded()' },
  styleUrl: './product-list.component.css',
  templateUrl: './product-list.component.html',
})
export class ProductListComponent {
  /** Nhúng trong trang khác (khuyến mãi, bộ sưu tập): không có breadcrumb, tiêu đề do trang đó đặt. */
  readonly embedded = input(false);
  readonly heading = input('');
  /** Chỉ liệt kê sản phẩm đang khuyến mãi; ẩn ô lọc khuyến mãi vì đã cố định. */
  readonly onlyPromotion = input(false);
  /** Slug bộ sưu tập: chỉ liệt kê sản phẩm thuộc bộ sưu tập này. */
  readonly collection = input<string | undefined>(undefined);
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  private readonly api = inject(CatalogApiService);
  private readonly imageResults = inject(ImageSearchResultsService);
  protected readonly search = inject(SearchUiService);
  protected readonly imageSearch = computed(() => this.params().has('image'));
  protected readonly imagePreview = computed(() => this.imageResults.preview(this.params().get('image') ?? ''));
  protected readonly retry = new Subject<number>();

  protected readonly bannerTracker = inject(BannerTrackerService);
  /** Banner trang danh mục (FR-011): chỉ khi đang lọc đúng một danh mục. */
  protected readonly categoryBanner = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => (p.get('categoryIds') ?? '').split(',').filter(Boolean)),
      map((ids) => (ids.length === 1 ? ids[0] : '')),
      distinctUntilChanged(),
      switchMap((id) =>
        id && !this.embedded()
          ? this.api.getBanners('CATEGORY', id).pipe(
              map((list): Banner | null => list[0] ?? null),
              catchError(() => of(null)),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** Đặc tính có thật trong kết quả hiện tại; chỉ phụ thuộc ngữ cảnh tìm kiếm, không phụ thuộc bộ lọc đang chọn. */
  protected readonly facets = toSignal(
    combineLatest([
      this.route.queryParamMap.pipe(
        map((p) => ({
          q: p.get('q') ?? undefined,
          image: p.get('image'),
          categoryIds: p.get('categoryIds') ?? '',
        })),
        distinctUntilChanged(
          (a, b) => a.q === b.q && a.image === b.image && a.categoryIds === b.categoryIds,
        ),
      ),
      toObservable(
        computed(() => ({ promo: this.onlyPromotion(), collection: this.collection() })),
      ),
    ]).pipe(
      switchMap(([{ q, image, categoryIds }, lock]) => {
        const saved = image ? this.imageResults.get(image) : undefined;
        if (saved && !saved.length) return of(null);
        return this.api
          .getFacets({
            q,
            ids: saved?.map((item) => item.id),
            categoryIds: categoryIds ? categoryIds.split(',') : undefined,
            collection: lock.collection,
            hasPromotion: lock.promo || undefined,
          })
          .pipe(catchError(() => of(null)));
      }),
    ),
    // undefined: đang tải; null: tải lỗi (khi đó thanh giá dùng khoảng giá toàn cửa hàng).
    { initialValue: undefined as ProductFacets | null | undefined },
  );
  /** Danh mục còn sản phẩm khớp (chưa có dữ liệu facet thì hiện tất cả). */
  protected readonly facetCategoryIds = computed(
    () => new Set(this.facets()?.categoryIds.map((c) => c.id)),
  );
  protected facetCount(id: string): number {
    return this.facets()?.categoryIds.find((c) => c.id === id)?.count ?? 0;
  }
  protected optionSelected(key: 'color' | 'material', value: string): boolean {
    return this.form.controls[key].value.split(',').map((v) => v.trim()).includes(value);
  }
  protected toggleOption(key: 'color' | 'material', value: string): void {
    const control = this.form.controls[key];
    const current = control.value.split(',').map((v) => v.trim()).filter(Boolean);
    control.setValue(
      (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).join(','),
    );
    control.markAsDirty();
  }
  private readonly filterUpdates = new Subject<number>();
  protected readonly filtersOpen = signal(false);
  private readonly filterClose = viewChild<ElementRef<HTMLButtonElement>>('filterClose');
  protected openFilters(): void {
    this.filtersOpen.set(true);
    requestAnimationFrame(() => this.filterClose()?.nativeElement.focus());
  }
  protected keepFilterFocus(event: KeyboardEvent, container: HTMLElement): void {
    if (!this.filtersOpen()) return;
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  protected readonly filterError = signal('');
  protected readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly categories = toSignal(
    this.api.getCategories().pipe(
      map((items) => items.flatMap((c) => [c, ...(c.children ?? [])])),
      catchError(() => of<Category[]>([])),
    ),
    { initialValue: [] },
  );
  /** Tên danh mục khi khách đang xem đúng một danh mục (từ trang chủ hoặc bộ lọc). */
  protected readonly categoryName = computed(() => {
    const ids = (this.params().get('categoryIds') ?? '').split(',').filter(Boolean);
    if (ids.length !== 1) return '';
    return this.categories().find((c) => c.id === ids[0])?.name ?? '';
  });
  protected readonly categoryGroups = computed(() => {
    const available = this.facets() ? this.facetCategoryIds() : null;
    const visible = (c: Category) => !available || available.has(c.id);
    return [
      {
        name: 'Phân loại',
        type: 'PRODUCT_CATEGORY',
        items: this.categories().filter((c) => c.type === 'PRODUCT_CATEGORY' && visible(c)),
      },
      {
        name: 'Không gian',
        type: 'ROOM',
        items: this.categories().filter((c) => c.type === 'ROOM' && visible(c)),
      },
      {
        name: 'Phong cách',
        type: 'STYLE',
        items: this.categories().filter((c) => c.type === 'STYLE' && visible(c)),
      },
    ].filter((group) => group.items.length);
  });
  protected readonly rooms = computed(() => this.categories().filter((c) => c.type === 'ROOM'));
  protected selectRoom(id: string): void {
    void this.router.navigate(['/products'], { queryParams: { categoryIds: id } });
  }
  protected readonly form = inject(FormBuilder).nonNullable.group({
    categoryIds: [[] as string[]],
    minPrice: '',
    maxPrice: '',
    color: '',
    material: '',
    minLength: '',
    maxLength: '',
    inStock: false,
    hasPromotion: false,
    badge: '',
  });
  protected chips() {
    const names: Record<string, string> = {
      categoryIds: 'Danh mục',
      minPrice: 'Giá từ',
      maxPrice: 'Giá đến',
      color: 'Màu',
      material: 'Chất liệu',
      minLength: 'Dài từ',
      maxLength: 'Dài đến',
      inStock: 'Còn hàng',
      hasPromotion: 'Khuyến mãi',
      badge: 'Nhãn',
    };
    return this.params()
      .keys.filter((key) => names[key])
      .map((key) => {
        const value = this.params().get(key) ?? '';
        let label = names[key] + ': ' + value;
        if (key === 'categoryIds')
          label = value
            .split(',')
            .map((id) => this.categories().find((c) => c.id === id)?.name ?? id)
            .join(', ');
        else if (key === 'minPrice' || key === 'maxPrice')
          label = names[key] + ': ' + this.formatPrice(value) + ' ₫';
        else if (key === 'inStock' || key === 'hasPromotion') label = names[key];
        else if (key === 'badge') label = value === 'NEW' ? 'Hàng mới' : 'Bán chạy';
        else if (key === 'minLength' || key === 'maxLength') label += ' cm';
        return { key, label };
      });
  }
  protected formatPrice(value: string): string {
    return value !== '' && Number.isFinite(Number(value))
      ? PRICE_FORMATTER.format(Number(value))
      : '';
  }
  protected enterPrice(input: HTMLInputElement, key: 'minPrice' | 'maxPrice'): void {
    const beforeCursor = input.value
      .slice(0, input.selectionStart ?? input.value.length)
      .replace(/\D/g, '').length;
    const digits = input.value.replace(/\D/g, '').slice(0, 15);
    const raw = digits ? String(Number(digits)) : '';
    this.form.controls[key].setValue(raw);
    this.form.controls[key].markAsDirty();
    input.value = this.formatPrice(raw);
    let cursor = 0,
      count = 0;
    while (cursor < input.value.length && count < beforeCursor) {
      if (/\d/.test(input.value[cursor])) count++;
      cursor++;
    }
    input.setSelectionRange(cursor, cursor);
    this.filterError.set('');
  }
  protected changePriceRange(change: { key: 'minPrice' | 'maxPrice'; value: string }): void {
    this.form.controls[change.key].setValue(change.value);
    this.form.controls[change.key].markAsDirty();
    this.filterError.set('');
  }
  protected toggleCategory(id: string): void {
    const control = this.form.controls.categoryIds;
    control.setValue(
      control.value.includes(id)
        ? control.value.filter((value) => value !== id)
        : [...control.value, id],
    );
    control.markAsDirty();
  }
  constructor() {
    this.filterUpdates
      .pipe(
        switchMap((delay) => (delay < 0 ? of(false) : timer(delay).pipe(map(() => true)))),
        takeUntilDestroyed(),
      )
      .subscribe((apply) => {
        if (apply) this.applyFilters();
      });
    let previous = this.form.getRawValue();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const value = this.form.getRawValue();
      const immediate =
        value.categoryIds !== previous.categoryIds ||
        value.inStock !== previous.inStock ||
        value.hasPromotion !== previous.hasPromotion ||
        value.badge !== previous.badge;
      previous = value;
      this.filterUpdates.next(immediate ? 0 : 300);
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.filterUpdates.next(-1);
      this.filterError.set('');
      this.form.reset(
        {
          categoryIds: p.get('categoryIds')?.split(',') ?? [],
          minPrice: p.get('minPrice') ?? '',
          maxPrice: p.get('maxPrice') ?? '',
          color: p.get('color') ?? '',
          material: p.get('material') ?? '',
          minLength: p.get('minLength') ?? '',
          maxLength: p.get('maxLength') ?? '',
          inStock: p.get('inStock') === 'true',
          hasPromotion: p.get('hasPromotion') === 'true',
          badge: p.get('badge') ?? '',
        },
        { emitEvent: false },
      );
      previous = this.form.getRawValue();
    });
  }
  protected setSort(sort: string): void {
    this.update({ sort, page: null });
  }
  protected remove(key: string): void {
    this.update({ [key]: null, page: null });
  }
  protected clear(): void {
    this.filterUpdates.next(-1);
    this.form.reset(undefined, { emitEvent: false });
    this.filterError.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.term() || null,
        sort: this.params().get('sort'),
        image: this.params().get('image'),
      },
    });
  }
  private applyFilters(): void {
    const value = this.form.getRawValue();
    for (const [min, max] of [
      [value.minPrice, value.maxPrice],
      [value.minLength, value.maxLength],
    ]) {
      if (
        (min !== '' && (!Number.isFinite(Number(min)) || Number(min) < 0)) ||
        (max !== '' && (!Number.isFinite(Number(max)) || Number(max) < 0)) ||
        (min !== '' && max !== '' && Number(min) > Number(max))
      ) {
        this.filterError.set(
          'Khoảng lọc không hợp lệ. Giá trị từ phải nhỏ hơn hoặc bằng giá trị đến.',
        );
        return;
      }
    }
    this.filterError.set('');
    this.update({
      ...value,
      categoryIds: value.categoryIds.join(',') || null,
      minPrice: value.minPrice === '' ? null : value.minPrice,
      maxPrice: value.maxPrice === '' ? null : value.maxPrice,
      minLength: value.minLength === '' ? null : value.minLength,
      maxLength: value.maxLength === '' ? null : value.maxLength,
      color: value.color || null,
      material: value.material || null,
      badge: value.badge || null,
      inStock: value.inStock || null,
      hasPromotion: value.hasPromotion || null,
      page: null,
    });
  }
  private update(queryParams: Record<string, string | number | boolean | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
  protected readonly term = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('q') ?? '')), {
    initialValue: '',
  });
  protected readonly result = toSignal(
    combineLatest([
      this.route.queryParamMap,
      this.retry.pipe(startWith(0)),
      // Đầu vào của trang nhúng chỉ có giá trị sau khi khởi tạo, nên phải theo dõi như một luồng.
      toObservable(computed(() => ({ promo: this.onlyPromotion(), collection: this.collection() }))),
    ]).pipe(
      switchMap(([p, , lock]) => {
        const imageId = p.get('image');
        const saved = imageId ? this.imageResults.get(imageId) : undefined;
        if (imageId && !saved) return of({ ...EMPTY, loading: false, error: true });
        if (saved && !saved.length) return of({ ...EMPTY, loading: false });
        return (
        this.api
          .getProducts({
            q: p.get('q') ?? undefined,
            ids: saved?.map((item) => item.id),
            categoryIds: p.get('categoryIds')?.split(','),
            color: p.get('color')?.split(','),
            material: p.get('material')?.split(','),
            minPrice: p.has('minPrice') ? Number(p.get('minPrice')) : undefined,
            maxPrice: p.has('maxPrice') ? Number(p.get('maxPrice')) : undefined,
            minLength: p.has('minLength') ? Number(p.get('minLength')) : undefined,
            maxLength: p.has('maxLength') ? Number(p.get('maxLength')) : undefined,
            inStock: p.get('inStock') === 'true' || undefined,
            hasPromotion: lock.promo || p.get('hasPromotion') === 'true' || undefined,
            collection: lock.collection,
            badge: (p.get('badge') || undefined) as ProductListQuery['badge'],
            sort: saved ? 'newest' : ((p.get('sort') || 'newest') as ProductSort),
            page: saved ? 1 : Math.max(1, Number(p.get('page')) || 1),
            limit: saved ? 100 : 12,
          })
          .pipe(
            map((r): Result => {
              if (!saved) return { ...r, loading: false, error: false };
              // Kết quả tìm ảnh: giữ độ giống ảnh, mặc định xếp theo độ giống rồi mới phân trang.
              const rank = new Map(saved.map((item, index) => [item.id, index]));
              const byId = new Map(saved.map((item) => [item.id, item]));
              const items = r.items.map((item) => ({ ...item, ...byId.get(item.id) }));
              const sort = p.get('sort') || 'similarity';
              if (sort === 'similarity')
                items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
              else if (sort === 'price_asc') items.sort((a, b) => a.priceFrom - b.priceFrom);
              else if (sort === 'price_desc') items.sort((a, b) => b.priceFrom - a.priceFrom);
              else if (sort === 'name_asc') items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
              else if (sort === 'name_desc') items.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
              const totalPages = Math.ceil(items.length / 12);
              const page = Math.min(Math.max(1, Number(p.get('page')) || 1), totalPages || 1);
              return {
                items: items.slice((page - 1) * 12, page * 12),
                meta: { page, limit: 12, total: items.length, totalPages },
                loading: false,
                error: false,
              };
            }),
            catchError(() => of({ ...EMPTY, loading: false, error: true })),
            startWith(EMPTY),
          )
        );
      }),
    ),
    { initialValue: EMPTY },
  );
  protected page(direction: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: this.result().meta.page + direction },
      queryParamsHandling: 'merge',
    });
  }
}
