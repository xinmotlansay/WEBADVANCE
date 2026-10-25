import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ElementRef,
  viewChild,
  computed,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CatalogApiService,
  ProductListItem,
  PageMeta,
  ProductListQuery,
  ProductSort,
  Category,
} from 'shared';
import { catchError, map, of, startWith, Subject, switchMap, combineLatest, timer } from 'rxjs';
import { ProductCardComponent } from '../../shared/ui/product-card/product-card.component';
import { CatalogIntroComponent } from './catalog-intro.component';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { PriceRangeComponent } from './price-range.component';
import { ImageSearchResultsService } from '../../core/search/image-search-results.service';

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

@Component({
  selector: 'app-product-list',
  imports: [
    ProductCardComponent,
    ReactiveFormsModule,
    RouterLink,
    CatalogIntroComponent,
    IconComponent,
    PriceRangeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './product-list.component.css',
  templateUrl: './product-list.component.html',
})
export class ProductListComponent {
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  private readonly api = inject(CatalogApiService);
  private readonly imageResults = inject(ImageSearchResultsService);
  protected readonly imageSearch = computed(() => this.params().has('image'));
  protected readonly retry = new Subject<number>();
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
  protected readonly categoryGroups = computed(() =>
    [
      {
        name: 'Phân loại',
        type: 'PRODUCT_CATEGORY',
        items: this.categories().filter((c) => c.type === 'PRODUCT_CATEGORY'),
      },
      {
        name: 'Không gian',
        type: 'ROOM',
        items: this.categories().filter((c) => c.type === 'ROOM'),
      },
      {
        name: 'Phong cách',
        type: 'STYLE',
        items: this.categories().filter((c) => c.type === 'STYLE'),
      },
    ].filter((group) => group.items.length),
  );
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
      queryParams: { q: this.term() || null, sort: this.params().get('sort') },
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
    combineLatest([this.route.queryParamMap, this.retry.pipe(startWith(0))]).pipe(
      switchMap(([p]) => {
        const imageId = p.get('image');
        if (imageId) {
          const saved = this.imageResults.get(imageId);
          if (!saved) return of({ ...EMPTY, loading: false, error: true });
          const items = [...saved];
          switch (p.get('sort')) {
            case 'price_asc': items.sort((a, b) => a.priceFrom - b.priceFrom); break;
            case 'price_desc': items.sort((a, b) => b.priceFrom - a.priceFrom); break;
            case 'name_asc': items.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
            case 'name_desc': items.sort((a, b) => b.name.localeCompare(a.name, 'vi')); break;
          }
          const totalPages = Math.ceil(items.length / 12);
          const page = Math.min(Math.max(1, Number(p.get('page')) || 1), totalPages || 1);
          return of<Result>({
            items: items.slice((page - 1) * 12, page * 12),
            meta: { page, limit: 12, total: items.length, totalPages },
            loading: false, error: false,
          });
        }
        return (
        this.api
          .getProducts({
            q: p.get('q') ?? undefined,
            categoryIds: p.get('categoryIds')?.split(','),
            color: p.get('color')?.split(','),
            material: p.get('material')?.split(','),
            minPrice: p.has('minPrice') ? Number(p.get('minPrice')) : undefined,
            maxPrice: p.has('maxPrice') ? Number(p.get('maxPrice')) : undefined,
            minLength: p.has('minLength') ? Number(p.get('minLength')) : undefined,
            maxLength: p.has('maxLength') ? Number(p.get('maxLength')) : undefined,
            inStock: p.get('inStock') === 'true' || undefined,
            hasPromotion: p.get('hasPromotion') === 'true' || undefined,
            badge: (p.get('badge') || undefined) as ProductListQuery['badge'],
            sort: (p.get('sort') || 'newest') as ProductSort,
            page: Math.max(1, Number(p.get('page')) || 1),
            limit: 12,
          })
          .pipe(
            map((r): Result => ({ ...r, loading: false, error: false })),
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
