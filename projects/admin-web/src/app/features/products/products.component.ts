import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { AdminApiService, apiMessage, type ProductQuery, type ProductRow } from '../../core/api/admin-api.service';
import { FORMAT_PIPES, formatDate } from '../../shared/format';
import { PRODUCT_STATUS, STOCK_STATE, toneClass } from '../../shared/status';
import { downloadCsv } from '../../shared/export';
import { IconComponent } from '../../shared/ui/icon.component';
import { FilterChipComponent, type ChipOption } from '../../shared/ui/filter-chip.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { NotificationBellComponent, type BellItem } from '../../shared/ui/notification-bell.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { ToastService } from '../../shared/ui/toast';
import { ProductPopupComponent } from './product-popup.component';
import { StockImportDialogComponent } from './stock-import-dialog.component';

const STATUS_ORDER = ['ACTIVE', 'DRAFT', 'HIDDEN', 'DISCONTINUED'];

/** PA-02 + PA-03: danh sách sản phẩm kèm dashboard sản phẩm ở cột phải (Product Admin, Admin cấp cao). */
@Component({
  selector: 'app-products',
  imports: [
    RouterLink,
    IconComponent,
    FilterChipComponent,
    BulkBarComponent,
    NotificationBellComponent,
    ConfirmDialogComponent,
    ProductPopupComponent,
    StockImportDialogComponent,
    ...FORMAT_PIPES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products.component.html',
  styleUrl: './products.component.css',
})
export class ProductsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly productStatus = PRODUCT_STATUS;
  protected readonly stockState = STOCK_STATE;
  protected readonly toneClass = toneClass;

  // ----- Cột tổng quan -----
  protected readonly dashboard = rxResource({ loader: () => this.api.productDashboard() });
  protected readonly statusStack = computed(() => {
    const data = this.dashboard.value();
    if (!data) return [];
    const total = Math.max(1, data.totalProducts);
    return [
      { key: 'ACTIVE', label: 'đang bán', count: data.byStatus['ACTIVE'] ?? 0, cls: '' },
      { key: 'DRAFT', label: 'nháp', count: data.byStatus['DRAFT'] ?? 0, cls: 'accent' },
      {
        key: 'OFF',
        label: 'ẩn / ngừng',
        count: (data.byStatus['HIDDEN'] ?? 0) + (data.byStatus['DISCONTINUED'] ?? 0),
        cls: 'muted-fill',
      },
    ].map((part) => ({ ...part, width: (part.count / total) * 100 }));
  });
  protected readonly topMax = computed(() =>
    Math.max(1, ...(this.dashboard.value()?.topSelling ?? []).map((p) => p.quantity)),
  );
  protected readonly bell = computed<BellItem[]>(() => {
    const alerts = this.dashboard.value()?.alerts;
    if (!alerts) return [];
    const items: BellItem[] = [];
    if (alerts.outOfStock) items.push({ key: 'OUT', title: `${alerts.outOfStock} biến thể hết hàng`, detail: 'Cần nhập kho ngay' });
    if (alerts.lowStock) items.push({ key: 'LOW', title: `${alerts.lowStock} biến thể sắp hết hàng`, detail: 'Dưới ngưỡng cảnh báo' });
    if (alerts.incomplete) items.push({ key: 'DRAFT', title: `${alerts.incomplete} sản phẩm nháp`, detail: 'Bổ sung ảnh, giá hoặc kiện để lên kệ' });
    return items;
  });

  // ----- Bộ lọc & bảng -----
  protected readonly searchText = signal('');
  private readonly search = toSignal(toObservable(this.searchText).pipe(debounceTime(300)), { initialValue: '' });
  protected readonly statusFilter = signal<string[]>([]);
  protected readonly categoryFilter = signal<string[]>([]);
  protected readonly roomFilter = signal<string[]>([]);
  protected readonly stockFilter = signal<string[]>([]);
  protected readonly sort = signal('-updatedAt');
  protected readonly page = signal(1);

  protected readonly categories = rxResource({ loader: () => this.api.categoryOptions() });
  protected readonly categoryOptions = computed<ChipOption[]>(() =>
    (this.categories.value() ?? []).filter((c) => c.type === 'PRODUCT_CATEGORY').map((c) => ({ value: c.id, label: c.name })),
  );
  protected readonly roomOptions = computed<ChipOption[]>(() =>
    (this.categories.value() ?? []).filter((c) => c.type === 'ROOM').map((c) => ({ value: c.id, label: c.name })),
  );
  protected readonly statusOptions = computed<ChipOption[]>(() => {
    const counts = this.dashboard.value()?.byStatus ?? {};
    return STATUS_ORDER.map((s) => ({ value: s, label: PRODUCT_STATUS[s].label, count: counts[s] ?? 0 }));
  });
  protected readonly stockOptions: ChipOption[] = [
    { value: 'OK', label: 'Còn hàng' },
    { value: 'LOW', label: 'Sắp hết hàng' },
    { value: 'OUT', label: 'Hết hàng' },
  ];

  private readonly query = computed<ProductQuery>(() => ({
    q: this.search().trim() || undefined,
    status: this.statusFilter(),
    categoryId: this.categoryFilter()[0],
    roomId: this.roomFilter()[0],
    stock: this.stockFilter()[0],
    sort: this.sort(),
    page: this.page(),
    limit: 20,
  }));
  protected readonly products = rxResource({
    request: () => this.query(),
    loader: ({ request }) => this.api.products(request),
  });
  protected readonly rows = computed(() => this.products.value()?.data ?? []);
  protected readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      [this.statusFilter(), this.categoryFilter(), this.roomFilter(), this.stockFilter()].some((f) => f.length > 0),
  );

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly allChecked = computed(
    () => this.rows().length > 0 && this.rows().every((row) => this.selected().has(row.id)),
  );
  protected readonly selectedRows = computed(() => this.rows().filter((row) => this.selected().has(row.id)));

  protected readonly openProduct = signal<{ id: string; name: string } | null>(null);
  protected readonly importIds = signal<string[] | null>(null);
  protected readonly hidingSelected = signal(false);
  protected readonly bulkBusy = signal(false);

  protected setFilter(kind: 'status' | 'category' | 'room' | 'stock', values: string[]): void {
    ({
      status: this.statusFilter,
      category: this.categoryFilter,
      room: this.roomFilter,
      stock: this.stockFilter,
    })[kind].set(values);
    this.resetPaging();
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.searchText.set('');
    for (const filter of [this.statusFilter, this.categoryFilter, this.roomFilter, this.stockFilter]) filter.set([]);
    this.resetPaging();
  }

  /** Bấm cảnh báo ở cột phải hoặc chuông: lọc ngay danh sách tương ứng. */
  protected applyAlert(key: string): void {
    this.clearFilters();
    if (key === 'DRAFT') this.statusFilter.set(['DRAFT']);
    else this.stockFilter.set([key]);
  }

  protected toggleSort(field: 'name' | 'price' | 'stock'): void {
    const current = this.sort();
    if (field === 'price') this.sort.set(current === 'price' ? '-price' : 'price');
    else this.sort.set(current === field ? '-updatedAt' : field);
    this.page.set(1);
  }

  protected sortIcon(field: 'name' | 'price' | 'stock'): 'chevronDown' | 'chevronUp' | null {
    const sort = this.sort();
    if (field === 'price') return sort === 'price' ? 'chevronUp' : sort === '-price' ? 'chevronDown' : null;
    return sort === field ? 'chevronUp' : null;
  }

  protected toggleRow(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.rows().map((row) => row.id)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected goPage(page: number): void {
    this.page.set(page);
    this.clearSelection();
  }

  protected openImport(ids: string[]): void {
    this.importIds.set(ids);
  }

  protected importSelected(): void {
    this.importIds.set(this.selectedRows().map((row) => row.id));
  }

  protected ratingLabel(rating: number | null): string {
    return rating === null ? '—' : `${rating.toFixed(1).replace('.', ',')} ★`;
  }

  protected onImported(): void {
    this.importIds.set(null);
    this.clearSelection();
    this.refresh();
  }

  protected hideSelected(): void {
    const ids = this.selectedRows().map((row) => row.id);
    this.bulkBusy.set(true);
    this.api.bulkProductStatus(ids, 'HIDDEN').subscribe({
      next: ({ updated, failed }) => {
        this.bulkBusy.set(false);
        this.hidingSelected.set(false);
        this.clearSelection();
        this.toast.show(`Đã ẩn ${updated.length} sản phẩm${failed.length ? `, ${failed.length} không đổi được` : ''}.`);
        this.refresh();
      },
      error: (error: unknown) => {
        this.bulkBusy.set(false);
        this.hidingSelected.set(false);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  protected exportSelected(): void {
    this.exportRows(this.selectedRows(), 'san-pham-da-chon');
  }

  protected refresh(): void {
    this.products.reload();
    this.dashboard.reload();
  }

  private exportRows(rows: ProductRow[], name: string): void {
    downloadCsv(`${name}.csv`, [
      ['Sản phẩm', 'SKU', 'Danh mục', 'Phòng', 'Trạng thái', 'Cấp VC', 'Giá bán từ', 'Tồn', 'Tình trạng kho', 'Cập nhật'],
      ...rows.map((row) => [
        row.name,
        row.productCode,
        row.category ?? '',
        row.rooms.join(' / '),
        PRODUCT_STATUS[row.status]?.label ?? row.status,
        row.shippingTier ?? '',
        row.priceFrom ?? '',
        row.totalStock,
        STOCK_STATE[row.stockState].label,
        formatDate(row.updatedAt),
      ]),
    ]);
  }

  private resetPaging(): void {
    this.page.set(1);
    this.clearSelection();
  }

}
