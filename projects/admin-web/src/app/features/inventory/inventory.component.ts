import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import {
  AdminApiService,
  type InventoryQuery,
  type InventoryRow,
  type StockChangeType,
} from '../../core/api/admin-api.service';
import { FORMAT_PIPES, formatDate } from '../../shared/format';
import { STOCK_STATE, toneClass } from '../../shared/status';
import { downloadCsv } from '../../shared/export';
import { IconComponent } from '../../shared/ui/icon.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { FilterChipComponent, type ChipOption } from '../../shared/ui/filter-chip.component';
import { NotificationBellComponent, type BellItem } from '../../shared/ui/notification-bell.component';
import { StockAdjustDialogComponent } from './stock-adjust-dialog.component';
import { VariantImportDialogComponent } from './variant-import-dialog.component';

export const CHANGE_TYPE_LABEL: Record<StockChangeType, string> = {
  IMPORT: 'Nhập kho',
  SALE: 'Bán (đặt hàng)',
  ORDER_CANCEL_RESTORE: 'Hoàn do hủy đơn',
  RETURN_RESTOCK: 'Nhập lại hàng trả',
  STOCKTAKE: 'Kiểm kê',
  ADJUSTMENT: 'Điều chỉnh',
};

type Tab = 'stock' | 'history';

/** PA-08: tồn kho theo biến thể, cập nhật khi nhập hoặc điều chỉnh, lịch sử biến động, cảnh báo dưới ngưỡng. */
@Component({
  selector: 'app-inventory',
  imports: [
    RouterLink,
    IconComponent,
    BulkBarComponent,
    FilterChipComponent,
    NotificationBellComponent,
    StockAdjustDialogComponent,
    VariantImportDialogComponent,
    ...FORMAT_PIPES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent {
  private readonly api = inject(AdminApiService);

  /** Query `?q=` và `?state=` (liên kết từ thông báo tồn kho). */
  readonly q = input<string>();
  readonly state = input<string>();

  protected readonly stockState = STOCK_STATE;
  protected readonly toneClass = toneClass;
  protected readonly changeLabel = CHANGE_TYPE_LABEL;

  protected readonly tab = signal<Tab>('stock');

  // ----- Tồn kho -----
  protected readonly searchText = linkedSignal(() => this.q() ?? '');
  private readonly search = toSignal(toObservable(this.searchText).pipe(debounceTime(300)), { initialValue: '' });
  protected readonly stateFilter = linkedSignal<string[]>(() =>
    ['OK', 'LOW', 'OUT'].includes(this.state() ?? '') ? [this.state()!] : [],
  );
  protected readonly sort = signal('stock');
  protected readonly page = signal(1);
  protected readonly stateOptions: ChipOption[] = [
    { value: 'OK', label: 'Còn hàng' },
    { value: 'LOW', label: 'Sắp hết hàng' },
    { value: 'OUT', label: 'Hết hàng' },
  ];

  private readonly query = computed<InventoryQuery>(() => ({
    q: this.search().trim() || undefined,
    state: this.stateFilter()[0],
    sort: this.sort(),
    page: this.page(),
    limit: 20,
  }));
  protected readonly inventory = rxResource({
    request: () => this.query(),
    loader: ({ request }) => this.api.inventory(request),
  });
  protected readonly rows = computed(() => this.inventory.value()?.data ?? []);
  protected readonly hasFilters = computed(() => !!this.search().trim() || this.stateFilter().length > 0);

  protected readonly summary = rxResource({ loader: () => this.api.inventorySummary() });
  protected readonly stack = computed(() => {
    const v = this.summary.value()?.variants;
    if (!v) return [];
    const total = Math.max(1, v.ok + v.low + v.out);
    return [
      { key: 'OK', label: 'còn hàng', count: v.ok, cls: '' },
      { key: 'LOW', label: 'sắp hết', count: v.low, cls: 'accent' },
      { key: 'OUT', label: 'hết hàng', count: v.out, cls: 'attn' },
    ].map((p) => ({ ...p, width: (p.count / total) * 100 }));
  });
  protected readonly bell = computed<BellItem[]>(() => {
    const v = this.summary.value()?.variants;
    if (!v) return [];
    const items: BellItem[] = [];
    if (v.out) items.push({ key: 'OUT', title: `${v.out} biến thể hết hàng`, detail: 'Cần nhập kho ngay' });
    if (v.low) items.push({ key: 'LOW', title: `${v.low} biến thể sắp hết hàng`, detail: 'Dưới ngưỡng cảnh báo' });
    return items;
  });

  protected readonly selected = signal<ReadonlyMap<string, InventoryRow>>(new Map());
  protected readonly allChecked = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.variantId)),
  );
  protected readonly adjusting = signal<InventoryRow | null>(null);
  protected readonly importing = signal<InventoryRow[] | null>(null);

  // ----- Lịch sử -----
  protected readonly historyVariant = signal<{ id: string; label: string } | null>(null);
  protected readonly historyTypes = signal<string[]>([]);
  protected readonly historyPage = signal(1);
  protected readonly typeOptions: ChipOption[] = (Object.keys(CHANGE_TYPE_LABEL) as StockChangeType[]).map((t) => ({
    value: t,
    label: CHANGE_TYPE_LABEL[t],
  }));
  protected readonly history = rxResource({
    request: () =>
      this.tab() === 'history'
        ? {
            variantId: this.historyVariant()?.id,
            changeType: this.historyTypes(),
            page: this.historyPage(),
            limit: 20,
          }
        : undefined,
    loader: ({ request }) => this.api.stockHistory(request!),
  });

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.resetPaging();
  }

  protected setState(values: string[]): void {
    this.stateFilter.set(values);
    this.resetPaging();
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.stateFilter.set([]);
    this.resetPaging();
  }

  protected applyAlert(key: string): void {
    this.tab.set('stock');
    this.searchText.set('');
    this.setState([key]);
  }

  protected toggleSort(field: 'stock' | 'name'): void {
    const current = this.sort();
    if (field === 'stock') this.sort.set(current === 'stock' ? '-stock' : 'stock');
    else this.sort.set(current === 'name' ? 'stock' : 'name');
    this.page.set(1);
  }

  protected sortIcon(field: 'stock' | 'name'): 'chevronDown' | 'chevronUp' | null {
    const sort = this.sort();
    if (field === 'stock') return sort === 'stock' ? 'chevronUp' : sort === '-stock' ? 'chevronDown' : null;
    return sort === 'name' ? 'chevronUp' : null;
  }

  protected toggleRow(row: InventoryRow): void {
    const next = new Map(this.selected());
    if (next.has(row.variantId)) next.delete(row.variantId);
    else next.set(row.variantId, row);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    this.selected.set(this.allChecked() ? new Map() : new Map(this.rows().map((r) => [r.variantId, r])));
  }

  protected clearSelection(): void {
    this.selected.set(new Map());
  }

  protected goPage(page: number): void {
    this.page.set(page);
  }

  protected importSelected(): void {
    this.importing.set([...this.selected().values()]);
  }

  protected showHistory(row: InventoryRow): void {
    this.historyVariant.set({ id: row.variantId, label: `${row.sku}${row.color ? ' · ' + row.color : ''}` });
    this.historyTypes.set([]);
    this.historyPage.set(1);
    this.tab.set('history');
  }

  protected setHistoryTypes(values: string[]): void {
    this.historyTypes.set(values);
    this.historyPage.set(1);
  }

  protected clearHistoryVariant(): void {
    this.historyVariant.set(null);
    this.historyPage.set(1);
  }

  protected exportSelected(): void {
    downloadCsv('ton-kho-da-chon.csv', [
      ['Sản phẩm', 'SKU', 'Màu', 'Chất liệu', 'Tồn', 'Ngưỡng', 'Tình trạng', 'Biến động gần nhất'],
      ...[...this.selected().values()].map((r) => [
        r.productName,
        r.sku,
        r.color,
        r.material,
        r.stockQuantity,
        r.lowStockThreshold,
        STOCK_STATE[r.state].label,
        formatDate(r.lastMovementAt),
      ]),
    ]);
  }

  protected onSaved(): void {
    this.adjusting.set(null);
    this.importing.set(null);
    this.clearSelection();
    this.inventory.reload();
    this.summary.reload();
    if (this.tab() === 'history') this.history.reload();
  }

  private resetPaging(): void {
    this.page.set(1);
    this.clearSelection();
  }
}
