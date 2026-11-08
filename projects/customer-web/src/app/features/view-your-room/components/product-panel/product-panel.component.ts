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

  readonly addProduct = output<ProductListItem>();

  protected readonly query = signal('');
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly format = formatVnd;

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
    const active = this.activeCategoryId();
    const term = this.query().trim().toLowerCase();
    const groups = active ? this.groups().filter((g) => g.category.id === active) : this.groups();

    const unique = new Map<string, ProductListItem>();
    for (const group of groups) {
      for (const product of group.products) {
        if (term && !product.name.toLowerCase().includes(term)) continue;
        if (!unique.has(product.id)) unique.set(product.id, product);
      }
    }
    return [...unique.values()];
  });

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected selectCategory(categoryId: string | null): void {
    this.selectedCategoryId.set(categoryId);
  }
}
