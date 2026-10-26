import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogApiService, type Category } from 'shared';
import { catchError, of } from 'rxjs';
import { SearchUiService } from '../../core/search/search-ui.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

/** Cuộn quá ngưỡng này (px) thì header đổi sang nền trắng. */
const SCROLL_THRESHOLD = 24;

@Component({
  selector: 'app-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
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

  protected closeSearch(): void {
    this.search.closeSearch();
    this.searchInput()?.nativeElement.blur();
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
