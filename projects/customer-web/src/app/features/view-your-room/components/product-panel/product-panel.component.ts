import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { ProductListItem } from 'shared';
import { formatVnd, type RoomSuggestions } from '../../view-your-room.models';

export interface CategoryChip {
  id: string;
  name: string;
}

@Component({
  selector: 'app-product-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-panel.component.html',
  styleUrl: './product-panel.component.css',
})
export class ProductPanelComponent {
  /** Kết quả gợi ý từ server, `missing` là các nhóm đồ còn thiếu trong loại phòng đang chọn. */
  readonly suggestions = input<RoomSuggestions | null>(null);
  readonly failed = input(false);
  /** Kết quả tìm toàn catalog theo từ khóa; `null` khi chưa có từ khóa. */
  readonly searchResults = input<ProductListItem[] | null>(null);

  readonly addProduct = output<ProductListItem>();
  readonly search = output<string>();

  protected readonly query = signal('');
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly format = formatVnd;
  protected readonly isSearching = computed(() => this.query().trim().length > 0);

  protected readonly groups = computed(() => this.suggestions()?.missing ?? []);

  protected readonly chips = computed<CategoryChip[]>(() =>
    this.groups().map((group) => group.category),
  );

  /** Bỏ lựa chọn nếu nhóm đó đã được đặt đủ, tránh chip đang chọn trỏ tới nhóm không còn. */
  protected readonly activeCategoryId = computed(() => {
    const selected = this.selectedCategoryId();
    return this.chips().some((chip) => chip.id === selected) ? selected : null;
  });

  /** Gộp các nhóm còn thiếu thành một danh sách, mỗi sản phẩm chỉ hiện một lần. */
  protected readonly visibleProducts = computed(() => {
    // Có từ khóa thì kết quả lấy từ toàn catalog, không giới hạn theo nhóm còn thiếu.
    if (this.isSearching()) return this.searchResults() ?? [];

    const active = this.activeCategoryId();
    const groups = active ? this.groups().filter((g) => g.category.id === active) : this.groups();

    const unique = new Map<string, ProductListItem>();
    for (const group of groups) {
      for (const product of group.products) {
        if (!unique.has(product.id)) unique.set(product.id, product);
      }
    }
    return [...unique.values()];
  });

  protected setQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.search.emit(value);
  }

  protected selectCategory(categoryId: string | null): void {
    this.selectedCategoryId.set(categoryId);
  }
}
