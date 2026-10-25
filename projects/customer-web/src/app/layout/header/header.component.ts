import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, filter } from 'rxjs';
import { ProductSearchService } from '../../core/search/product-search.service';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogApiService, type Category } from 'shared';
import { catchError, map, of } from 'rxjs';
import { SearchUiService } from '../../core/search/search-ui.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { CartService } from '../../core/shopping/cart.service';

/** Cuộn quá ngưỡng này (px) thì header đổi sang nền trắng. */
const SCROLL_THRESHOLD = 24;

@Component({
  selector: 'app-header',
  imports: [RouterLink, IconComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.scrolled]': 'scrolled()',
    '[class.menu-open]': 'menuOpen()',
    '[class.search-open]': 'search.open()',
    '[class.solid]': 'solid()',
    '(window:scroll)': 'onScroll()',
  },
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthService);
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly searchData = inject(ProductSearchService);
  private readonly router = inject(Router);
  protected readonly solid = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0] !== '/'),
    ),
    { initialValue: this.router.url !== '/' },
  );
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
    { initialValue: [] },
  );

  protected submitSearch(value = this.searchControl.value): void {
    const q = value.trim();
    if (!q) {
      this.search.openSearch();
      return;
    }
    this.searchData.remember(q);
    this.searchControl.setValue(q);
    this.closeSearch();
    void this.router.navigate(['/search'], { queryParams: { q } });
  }
  private readonly api = inject(CatalogApiService);

  protected readonly search = inject(SearchUiService);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly menuOpen = signal(false);
  protected readonly scrolled = signal(false);

  private readonly categories = toSignal(
    this.api.getCategories().pipe(catchError(() => of<Category[]>([]))),
    { initialValue: [] as Category[] },
  );

  protected readonly productCategories = () =>
    this.categories().filter((c) => c.type === 'PRODUCT_CATEGORY');
  protected readonly rooms = () => this.categories().filter((c) => c.type === 'ROOM');

  constructor() {
    const syncKeyword = () => {
      const tree = this.router.parseUrl(this.router.url);
      this.searchControl.setValue(tree.queryParams['q'] ?? '');
    };
    syncKeyword();
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(),
    ).subscribe(() => {
      this.closeSearch();
      syncKeyword();
    });
    // Có yêu cầu mở tìm kiếm (từ header hoặc nút nổi ở chân trang): thu menu, đưa con trỏ vào ô.
    effect(() => {
      if (this.search.focusRequest() === 0) return;
      this.menuOpen.set(false);
      setTimeout(() => this.searchInput()?.nativeElement.focus({ preventScroll: true }), 0);
    });
  }

  protected onSearchFocusOut(event: FocusEvent, form: HTMLElement): void {
    if (!form.contains(event.relatedTarget as Node | null)) this.search.closeSearch();
  }

  protected closeSearch(): void {
    this.search.closeSearch();
    this.searchInput()?.nativeElement.blur();
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
