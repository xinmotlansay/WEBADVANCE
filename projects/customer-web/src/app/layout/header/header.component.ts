import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CatalogApiService, type Category, type ProductListItem } from 'shared';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth/auth.service';
import { CartStore } from '../../services/cart/cart.store';
import { ProductSearchService } from '../../services/search/product-search.service';
import { SearchUiService } from '../../services/search/search-ui.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { LinkDirective } from '../../shared/ui/link/link.directive';
import { GiftVoucherStripComponent } from '../gift-voucher-strip/gift-voucher-strip.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';

/** Cuộn quá ngưỡng này (px) thì header đổi sang nền trắng. */
const SCROLL_THRESHOLD = 24;

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    IconComponent,
    ReactiveFormsModule,
    VndPipe,
    GiftVoucherStripComponent,
    LinkDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.solid]': '!isHome() || solid()',
    '[class.scrolled]': 'scrolled()',
    '[class.menu-open]': 'menuOpen()',
    '[class.search-open]': 'search.open()',
    '(window:scroll)': 'onScroll()',
  },
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  private readonly api = inject(CatalogApiService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly announcement = toSignal(
    this.api.getAnnouncementBar().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** Nền trắng chữ đen ngay từ đầu, cho trang không có ảnh lớn đầu trang (giỏ hàng). */
  readonly solid = input(false);

  protected readonly search = inject(SearchUiService);
  protected readonly searchData = inject(ProductSearchService);
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly suggestions = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) =>
        q.trim()
          ? this.searchData.suggestions(q.trim()).pipe(catchError(() => of<string[]>([])))
          : of<string[]>([]),
      ),
    ),
    { initialValue: [] as string[] },
  );
  /** Sản phẩm khớp từ khóa, hiện dưới danh sách gợi ý. */
  protected readonly productResults = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) =>
        q.trim()
          ? this.api.getProducts({ q: q.trim(), limit: 6 }).pipe(
              map((r) => ({ items: r.items, total: r.meta.total })),
              catchError(() => of({ items: [] as ProductListItem[], total: 0 })),
            )
          : of({ items: [] as ProductListItem[], total: 0 }),
      ),
    ),
    { initialValue: { items: [] as ProductListItem[], total: 0 } },
  );
  protected readonly cart = inject(CartStore);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly menuOpen = signal(false);
  protected readonly scrolled = signal(false);

  /** Chỉ trang chủ có header trong suốt đè lên banner; các trang khác header luôn nền trắng. */
  protected readonly isHome = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0] === '/'),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] === '/' },
  );

  private readonly categories = toSignal(
    this.api.getCategories().pipe(catchError(() => of<Category[]>([]))),
    { initialValue: [] as Category[] },
  );

  protected readonly productCategories = () =>
    this.categories().filter((c) => c.type === 'PRODUCT_CATEGORY');
  protected readonly rooms = () => this.categories().filter((c) => c.type === 'ROOM');

  constructor() {
    this.cart.ensureLoaded();

    // Có yêu cầu mở tìm kiếm (từ header hoặc nút nổi ở chân trang): thu menu, đưa con trỏ vào ô.
    effect(() => {
      if (this.search.focusRequest() === 0) return;
      this.menuOpen.set(false);
      setTimeout(() => this.searchInput()?.nativeElement.focus(), 0);
    });
  }

  protected onSearchFocusOut(event: FocusEvent, form: HTMLElement): void {
    if (!form.contains(event.relatedTarget as Node | null)) this.search.closeSearch();
  }

  protected submitSearch(value = this.searchControl.value): void {
    const q = value.trim();
    this.searchData.remember(q);
    this.searchControl.setValue(q);
    this.closeSearch();
    void this.router.navigate(['/search'], { queryParams: { q: q || null } });
  }

  protected closeSearch(): void {
    this.search.closeSearch();
    this.searchInput()?.nativeElement.blur();
  }

  /** Có chữ thì xóa chữ và giữ ô nhập; ô trống thì đóng ô tìm kiếm. */
  protected clearOrClose(): void {
    if (!this.searchControl.value) {
      this.closeSearch();
      return;
    }
    this.searchControl.setValue('');
    this.searchInput()?.nativeElement.focus({ preventScroll: true });
  }

  protected openImageSearch(): void {
    this.closeSearch();
    this.search.openImageSearch();
  }

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > SCROLL_THRESHOLD);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
