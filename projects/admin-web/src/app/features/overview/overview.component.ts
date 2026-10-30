import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import {
  AdminApiService,
  apiMessage,
  type OrderQuery,
  type OrderRow,
  type Period,
} from '../../core/api/admin-api.service';
import {
  FORMAT_PIPES,
  formatAge,
  formatDate,
  formatMoneyShort,
  formatPercent,
  formatVnd,
} from '../../shared/format';
import { DELIVERED_BY, ORDER_STATUS, ORDER_STATUS_ORDER, toneClass } from '../../shared/status';
import { downloadCsv, printDocument } from '../../shared/export';
import { IconComponent } from '../../shared/ui/icon.component';
import { FilterChipComponent, type ChipOption } from '../../shared/ui/filter-chip.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { NotificationBellComponent, type BellItem } from '../../shared/ui/notification-bell.component';
import { ToastService } from '../../shared/ui/toast';
import { OrderPopupComponent } from '../orders/order-popup.component';

const PERIODS: { value: Period; label: string; caption: string }[] = [
  { value: 'today', label: 'Hôm nay', caption: 'hôm nay' },
  { value: '7d', label: '7 ngày', caption: '7 ngày gần nhất' },
  { value: '30d', label: '30 ngày', caption: '30 ngày gần nhất' },
  { value: 'month', label: 'Tháng', caption: 'tháng này' },
];

const DATE_FILTERS: ChipOption[] = [
  { value: '0', label: 'Hôm nay' },
  { value: '6', label: '7 ngày qua' },
  { value: '29', label: '30 ngày qua' },
];

const DAY = 86_400_000;

/** AD-02: Dashboard tổng quan của Admin cấp cao, kèm bảng đơn gần đây xử lý nhanh (OA-03, OA-04). */
@Component({
  selector: 'app-overview',
  imports: [
    IconComponent,
    FilterChipComponent,
    BulkBarComponent,
    NotificationBellComponent,
    OrderPopupComponent,
    ...FORMAT_PIPES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
})
export class OverviewComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly periods = PERIODS;
  protected readonly dateFilters = DATE_FILTERS;
  protected readonly orderStatus = ORDER_STATUS;
  protected readonly statusOrder = ORDER_STATUS_ORDER;
  protected readonly deliveredBy = DELIVERED_BY;
  protected readonly toneClass = toneClass;
  protected readonly formatAge = formatAge;
  protected readonly today = formatDate(new Date());
  protected readonly weekday = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());

  // ----- Cột tổng quan -----
  protected readonly period = signal<Period>('30d');
  protected readonly overview = rxResource({
    request: () => this.period(),
    loader: ({ request }) => this.api.overview(request),
  });
  protected readonly periodCaption = computed(
    () => PERIODS.find((p) => p.value === this.period())?.caption ?? '',
  );

  protected readonly months = computed(() => {
    const rows = this.overview.value()?.revenueByMonth ?? [];
    const max = Math.max(1, ...rows.map((r) => r.revenue));
    return rows.map((row, index) => ({
      ...row,
      height: row.revenue ? Math.max(4, (row.revenue / max) * 100) : 0,
      current: index === rows.length - 1,
      text: row.revenue ? formatMoneyShort(row.revenue).replace('tr', '') : '0',
    }));
  });
  protected readonly chartUnit = computed(() =>
    (this.overview.value()?.revenueByMonth ?? []).some((r) => r.revenue >= 1e9) ? 'tỷ đồng' : 'triệu đồng',
  );

  /** Trạng thái đơn: thanh theo căn bậc hai để mục nhỏ vẫn nhìn thấy, luôn in số thật (mục 7). */
  protected readonly statusBars = computed(() => {
    const counts = this.overview.value()?.ordersByStatus ?? {};
    const max = Math.sqrt(Math.max(1, ...Object.values(counts)));
    return ORDER_STATUS_ORDER.map((status) => ({
      status,
      label: ORDER_STATUS[status].label,
      count: counts[status] ?? 0,
      width: ((Math.sqrt(counts[status] ?? 0) / max) * 100).toFixed(1),
      tone: ORDER_STATUS[status].tone,
    }));
  });

  protected readonly customerShare = computed(() => {
    const mix = this.overview.value()?.customers;
    const total = (mix?.new ?? 0) + (mix?.returning ?? 0);
    return total ? ((mix!.new / total) * 100).toFixed(1) : '0';
  });

  protected readonly topMax = computed(() =>
    Math.max(1, ...(this.overview.value()?.topProducts ?? []).map((p) => p.quantity)),
  );

  protected readonly bell = computed<BellItem[]>(() => {
    const data = this.overview.value();
    if (!data) return [];
    const items: BellItem[] = [];
    if (data.overdue.count) {
      items.push({
        key: 'overdue',
        title: `${data.overdue.count} đơn chờ xác nhận quá hạn`,
        detail: `Quá ${data.overdue.thresholdHours} giờ chưa xác nhận`,
      });
    }
    const pending = data.ordersByStatus['PENDING_CONFIRMATION'] ?? 0;
    if (pending) items.push({ key: 'pending', title: `${pending} đơn chờ xác nhận`, detail: 'Kiểm tra và xác nhận đơn' });
    const failed = data.ordersByStatus['DELIVERY_FAILED'] ?? 0;
    if (failed) items.push({ key: 'failed', title: `${failed} đơn giao thất bại`, detail: 'Liên hệ giao lại hoặc hoàn hàng' });
    return items;
  });

  // ----- Bảng đơn gần đây -----
  protected readonly searchText = signal('');
  private readonly search = toSignal(toObservable(this.searchText).pipe(debounceTime(300)), {
    initialValue: '',
  });
  protected readonly statusFilter = signal<string[]>([]);
  protected readonly deliveryFilter = signal<string[]>([]);
  protected readonly dateFilter = signal<string[]>([]);
  protected readonly sort = signal('-createdAt');
  protected readonly page = signal(1);

  private readonly query = computed<OrderQuery>(() => {
    const days = this.dateFilter()[0];
    const from = days === undefined ? undefined : this.startOfVnDay(Date.now() - Number(days) * DAY);
    return {
      q: this.search().trim() || undefined,
      status: this.statusFilter(),
      delivery: (this.deliveryFilter()[0] as OrderQuery['delivery']) ?? '',
      from,
      sort: this.sort(),
      page: this.page(),
      limit: 20,
    };
  });

  protected readonly orders = rxResource({
    request: () => this.query(),
    loader: ({ request }) => this.api.orders(request),
  });

  protected readonly statusOptions = computed<ChipOption[]>(() => {
    const counts = this.orders.value()?.statusCounts ?? {};
    return ORDER_STATUS_ORDER.map((s) => ({ value: s, label: ORDER_STATUS[s].label, count: counts[s] ?? 0 }));
  });
  protected readonly deliveryOptions: ChipOption[] = [
    { value: 'FLEET', label: 'Đội xe CaraVeso' },
    { value: 'PARTNER', label: 'Đối tác vận chuyển' },
  ];
  protected readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      this.statusFilter().length > 0 ||
      this.deliveryFilter().length > 0 ||
      this.dateFilter().length > 0,
  );

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly rows = computed(() => this.orders.value()?.data ?? []);
  protected readonly allChecked = computed(
    () => this.rows().length > 0 && this.rows().every((row) => this.selected().has(row.id)),
  );
  protected readonly selectedRows = computed(() => this.rows().filter((row) => this.selected().has(row.id)));
  protected readonly confirmableCount = computed(
    () => this.selectedRows().filter((row) => row.status === 'PENDING_CONFIRMATION').length,
  );
  protected readonly bulkBusy = signal(false);

  protected readonly openOrder = signal<{ id: string; code: string } | null>(null);

  // ----- Hành động -----
  protected setFilter(kind: 'status' | 'delivery' | 'date', values: string[]): void {
    ({ status: this.statusFilter, delivery: this.deliveryFilter, date: this.dateFilter })[kind].set(values);
    this.resetPaging();
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.statusFilter.set([]);
    this.deliveryFilter.set([]);
    this.dateFilter.set([]);
    this.resetPaging();
  }

  protected filterByStatus(status: string): void {
    this.statusFilter.set([status]);
    this.resetPaging();
    document.getElementById('recent-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Xem tất cả" đơn quá hạn: lọc chờ xác nhận, cũ nhất trước. */
  protected showOverdue(): void {
    this.sort.set('createdAt');
    this.filterByStatus('PENDING_CONFIRMATION');
  }

  protected onBell(key: string): void {
    if (key === 'overdue') this.showOverdue();
    else this.filterByStatus(key === 'failed' ? 'DELIVERY_FAILED' : 'PENDING_CONFIRMATION');
  }

  protected toggleSort(field: 'createdAt' | 'totalAmount'): void {
    this.sort.set(this.sort() === `-${field}` ? field : `-${field}`);
    this.page.set(1);
  }

  protected sortIcon(field: string): 'chevronDown' | 'chevronUp' | null {
    const sort = this.sort();
    if (sort === `-${field}`) return 'chevronDown';
    if (sort === field) return 'chevronUp';
    return null;
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
    this.selected.set(new Set());
  }

  protected bulkConfirm(): void {
    const ids = this.selectedRows()
      .filter((row) => row.status === 'PENDING_CONFIRMATION')
      .map((row) => row.id);
    if (!ids.length || this.bulkBusy()) return;
    this.bulkBusy.set(true);
    this.api.bulkConfirm(ids).subscribe({
      next: ({ confirmed, skipped }) => {
        this.bulkBusy.set(false);
        this.selected.set(new Set());
        this.toast.show(
          `Đã xác nhận ${confirmed.length} đơn${skipped.length ? `, bỏ qua ${skipped.length} đơn đã đổi trạng thái` : ''}.`,
        );
        this.refresh();
      },
      error: (error: unknown) => {
        this.bulkBusy.set(false);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  protected exportSelected(): void {
    this.exportOrders(this.selectedRows(), 'don-hang-da-chon');
  }

  protected printSelected(): void {
    const rows = this.selectedRows();
    printDocument(`Danh sách ${rows.length} đơn hàng`, [
      {
        table: {
          head: ['Mã đơn', 'Khách hàng', 'SĐT', 'Giao bởi', 'Trạng thái', 'Tổng', 'Ngày'],
          rows: rows.map((row) => [
            `#${row.orderCode}`,
            row.customerName,
            row.customerPhone,
            DELIVERED_BY[row.deliveredBy],
            ORDER_STATUS[row.status]?.label ?? row.status,
            formatVnd(row.totalAmount),
            formatDate(row.createdAt),
          ]),
          numeric: [5],
        },
      },
    ]);
  }

  /** "Xuất báo cáo": số liệu tổng quan của kỳ đang xem + doanh thu theo tháng + trạng thái đơn. */
  protected exportReport(): void {
    const data = this.overview.value();
    if (!data) return;
    const caption = this.periodCaption();
    downloadCsv(`bao-cao-tong-quan-${data.period}.csv`, [
      ['Báo cáo tổng quan CaraVeso', `Xuất lúc ${formatDate(new Date())}`],
      [],
      ['Chỉ số', 'Giá trị', 'Kỳ'],
      ['Doanh thu', data.revenue.value, caption],
      ['Doanh thu kỳ trước', data.revenue.previous, caption],
      ['Số đơn tính doanh thu', data.revenue.orders, caption],
      ['Đơn hôm nay', data.kpis.ordersToday, 'hôm nay'],
      ['Giá trị TB/đơn', data.kpis.averageOrderValue, '30 ngày'],
      ['Tỷ lệ hủy', formatPercent(data.kpis.cancelRate), '30 ngày'],
      ['Tỷ lệ đổi/trả', formatPercent(data.kpis.returnRate), '30 ngày'],
      ['Khách mới', data.customers.new, caption],
      ['Khách quay lại', data.customers.returning, caption],
      [],
      ['Doanh thu theo tháng', 'VND'],
      ...data.revenueByMonth.map((m) => [m.month, m.revenue]),
      [],
      ['Trạng thái đơn', 'Số đơn'],
      ...ORDER_STATUS_ORDER.map((s) => [ORDER_STATUS[s].label, data.ordersByStatus[s] ?? 0]),
      [],
      ['Top sản phẩm (30 ngày)', 'Số lượng', 'Doanh thu'],
      ...data.topProducts.map((p) => [p.name, p.quantity, p.revenue]),
    ]);
  }

  protected refresh(): void {
    this.orders.reload();
    this.overview.reload();
  }

  protected deltaClass(value: number | null, goodWhenUp = true): string {
    if (value === null || Math.abs(value) < 0.0005) return 'delta flat';
    return `delta ${value > 0 === goodWhenUp ? 'up' : 'down'}`;
  }

  /** Mức thay đổi theo điểm phần trăm: "▲ 0,6 điểm". */
  protected pointsLabel(delta: number): string {
    if (Math.abs(delta) < 0.0005) return 'Không đổi so với 30 ngày trước';
    const points = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Math.abs(delta) * 100);
    return `${delta > 0 ? '▲' : '▼'} ${points} điểm so với 30 ngày trước`;
  }

  protected changeLabel(change: number | null, versus: string): string {
    if (change === null) return `${versus[0].toUpperCase()}${versus.slice(1)} chưa có số liệu`;
    return `${change >= 0 ? '▲ +' : '▼ '}${formatPercent(change, 0)} so với ${versus}`;
  }

  private exportOrders(rows: OrderRow[], name: string): void {
    downloadCsv(`${name}.csv`, [
      ['Mã đơn', 'Khách hàng', 'SĐT', 'Giao bởi', 'Trạng thái', 'Thanh toán', 'Tổng (VND)', 'Ngày đặt'],
      ...rows.map((row) => [
        row.orderCode,
        row.customerName,
        row.customerPhone,
        DELIVERED_BY[row.deliveredBy],
        ORDER_STATUS[row.status]?.label ?? row.status,
        row.paymentMethod,
        row.totalAmount,
        formatDate(row.createdAt),
      ]),
    ]);
  }

  private resetPaging(): void {
    this.page.set(1);
    this.selected.set(new Set());
  }

  private startOfVnDay(at: number): string {
    const offset = 7 * 3_600_000;
    return new Date(Math.floor((at + offset) / DAY) * DAY - offset).toISOString();
  }
}
