import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AdminApiService, apiMessage, type CategoryRow, type CategoryType } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { NotificationBellComponent, type BellItem } from '../../shared/ui/notification-bell.component';
import { ToastService } from '../../shared/ui/toast';
import { CATEGORY_TYPE_LABEL, CategoryDialogComponent } from './category-dialog.component';

const PAGE_SIZE = 20;
type SortKey = 'name' | '-products' | '-updatedAt';

/** PA-07: xem, thêm, sửa tên, mô tả, trạng thái danh mục; cấu hình nhóm đồ thường có trong phòng. */
@Component({
  selector: 'app-categories',
  imports: [IconComponent, BulkBarComponent, NotificationBellComponent, CategoryDialogComponent, ...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.css',
})
export class CategoriesComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly typeLabel = CATEGORY_TYPE_LABEL;
  protected readonly types: CategoryType[] = ['PRODUCT_CATEGORY', 'ROOM', 'STYLE'];

  protected readonly categories = rxResource({ loader: () => this.api.categories() });
  protected readonly all = computed(() => this.categories.value() ?? []);

  protected readonly tab = signal<CategoryType>('PRODUCT_CATEGORY');
  protected readonly search = signal('');
  protected readonly statusFilter = signal<'' | 'VISIBLE' | 'HIDDEN'>('');
  protected readonly sort = signal<SortKey>('name');
  protected readonly page = signal(1);

  protected readonly counts = computed(() => {
    const result: Record<CategoryType, number> = { PRODUCT_CATEGORY: 0, ROOM: 0, STYLE: 0 };
    for (const c of this.all()) result[c.type]++;
    return result;
  });

  private readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.all().filter(
      (c) =>
        c.type === this.tab() &&
        (!this.statusFilter() || c.status === this.statusFilter()) &&
        (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)),
    );
    const sort = this.sort();
    return rows.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'vi')
        : sort === '-products'
          ? b.productCount - a.productCount
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  });
  protected readonly total = computed(() => this.filtered().length);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly rows = computed(() => this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));
  protected readonly pageStart = computed(() => (this.page() - 1) * PAGE_SIZE);
  protected readonly hasFilters = computed(() => !!this.search().trim() || !!this.statusFilter());

  // ----- Cột tổng quan -----
  protected readonly roomsMissing = computed(() =>
    this.all().filter((c) => c.type === 'ROOM' && c.status === 'VISIBLE' && !c.typicalCategories.length),
  );
  protected readonly emptyVisible = computed(() => this.all().filter((c) => c.status === 'VISIBLE' && c.productCount === 0));
  protected readonly hiddenCount = computed(() => this.all().filter((c) => c.status === 'HIDDEN').length);
  protected readonly top = computed(() =>
    this.all()
      .filter((c) => c.type === 'PRODUCT_CATEGORY')
      .sort((a, b) => b.activeProductCount - a.activeProductCount)
      .slice(0, 5),
  );
  protected readonly topMax = computed(() => Math.max(1, ...this.top().map((c) => c.activeProductCount)));
  protected readonly bell = computed<BellItem[]>(() =>
    this.roomsMissing().length
      ? [{ key: 'ROOM', title: `${this.roomsMissing().length} phòng chưa có nhóm đồ`, detail: 'Cấu hình để gợi ý sản phẩm còn thiếu' }]
      : [],
  );

  // ----- Chọn & thao tác -----
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)));
  protected readonly bulkBusy = signal(false);
  protected readonly editing = signal<{ category: CategoryRow | null } | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected setTab(tab: CategoryType): void {
    this.tab.set(tab);
    this.reset();
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.reset();
  }

  protected setStatus(value: '' | 'VISIBLE' | 'HIDDEN'): void {
    this.statusFilter.set(this.statusFilter() === value ? '' : value);
    this.reset();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.reset();
  }

  protected toggleSort(key: SortKey): void {
    this.sort.set(this.sort() === key ? 'name' : key);
    this.page.set(1);
  }

  protected toggleRow(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.rows().map((r) => r.id)));
  }

  protected typicalNames(row: CategoryRow): string {
    return row.typicalCategories.map((t) => t.name).join(', ');
  }

  /** Ba nhóm đầu, phần còn lại rút gọn thành "+n". */
  protected typicalLabel(row: CategoryRow): string {
    const names = row.typicalCategories.map((t) => t.name);
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected goPage(page: number): void {
    this.page.set(page);
    this.selected.set(new Set());
  }

  protected openRoomsMissing(): void {
    this.tab.set('ROOM');
    this.clearFilters();
    const first = this.roomsMissing()[0];
    if (first) this.editing.set({ category: first });
  }

  protected toggleStatus(row: CategoryRow): void {
    const status = row.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE';
    this.busyId.set(row.id);
    this.api.setCategoryStatus(row.id, status).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.show(`${row.name}: ${status === 'VISIBLE' ? 'đã hiển thị' : 'đã ẩn'}.`);
        this.categories.reload();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  protected bulkStatus(status: 'VISIBLE' | 'HIDDEN'): void {
    const ids = [...this.selected()];
    this.bulkBusy.set(true);
    forkJoin(ids.map((id) => this.api.setCategoryStatus(id, status))).subscribe({
      next: () => {
        this.bulkBusy.set(false);
        this.selected.set(new Set());
        this.toast.show(`Đã ${status === 'VISIBLE' ? 'hiển thị' : 'ẩn'} ${ids.length} danh mục.`);
        this.categories.reload();
      },
      error: (error: unknown) => {
        this.bulkBusy.set(false);
        this.toast.show(apiMessage(error), 'error');
        this.categories.reload();
      },
    });
  }

  protected onSaved(): void {
    this.editing.set(null);
    this.categories.reload();
  }

  private reset(): void {
    this.page.set(1);
    this.selected.set(new Set());
  }
}
