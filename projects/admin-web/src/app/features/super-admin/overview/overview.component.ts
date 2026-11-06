import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import * as fmt from '../../../core/format/vn-format';
import { ROLE_LABELS } from '../../../core/navigation/admin-nav.config';
import { SuperAdminApiService } from '../super-admin-api.service';
import { ORDER_STATUS, ORDER_STATUS_ORDER, ROLE_SHORT, auditActionLabel } from '../super-admin.labels';
import type { OrderStatus, Overview, OverviewRange, RecentOrder } from '../super-admin.models';

const RANGES: { key: OverviewRange; label: string; period: string }[] = [
  { key: 'today', label: 'Hôm nay', period: 'hôm nay' },
  { key: '7d', label: '7 ngày', period: '7 ngày gần nhất' },
  { key: '30d', label: '30 ngày', period: '30 ngày gần nhất' },
  { key: 'month', label: 'Tháng', period: 'tháng này' },
];

/** Dashboard Tổng quan của Admin cấp cao (AD-02, admin-ui-rule mục 5, 7). */
@Component({
  selector: 'app-sa-overview',
  imports: [RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
  private readonly api = inject(SuperAdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly popupRef = viewChild<ElementRef<HTMLElement>>('popup');

  readonly fmt = fmt;
  readonly Math = Math;
  readonly statusInfo = ORDER_STATUS;
  readonly statusOrder = ORDER_STATUS_ORDER;
  readonly ranges = RANGES;
  readonly roleShort = ROLE_SHORT;
  readonly roleLabels = ROLE_LABELS;
  readonly actionLabel = auditActionLabel;
  readonly today = fmt.formatLongDate(new Date());

  readonly range = signal<OverviewRange>('30d');
  readonly data = signal<Overview | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly reload = signal(0);

  readonly search = signal('');
  readonly statusFilter = signal<OrderStatus | ''>('');
  readonly selected = signal<Set<string>>(new Set());
  readonly openOrder = signal<RecentOrder | null>(null);
  private popupOpener: HTMLElement | null = null;

  readonly periodLabel = computed(() => RANGES.find((r) => r.key === this.range())!.period);

  /** Biểu đồ cột: đơn vị tỷ khi có tháng từ 1 tỷ trở lên, ngược lại triệu đồng. */
  readonly chart = computed(() => {
    const months = this.data()?.revenue.byMonth ?? [];
    const max = Math.max(0, ...months.map((m) => m.revenue));
    const divisor = max >= 1e9 ? 1e9 : 1e6;
    return {
      unit: divisor === 1e9 ? 'tỷ đồng' : 'triệu đồng',
      bars: months.map((m, i) => ({
        label: `T${m.month}`,
        value: fmt.formatDecimal(m.revenue / divisor),
        height: max ? Math.max(2, (m.revenue / max) * 100) : 2,
        current: i === months.length - 1,
      })),
    };
  });

  /** Thanh trạng thái theo căn bậc hai vì chênh lệch rất lớn (mục 7); luôn in số thật. */
  readonly statusBars = computed(() => {
    const counts = this.data()?.ordersByStatus;
    if (!counts) return [];
    const max = Math.max(1, ...this.statusOrder.map((s) => counts[s]));
    const top = this.statusOrder.reduce((a, b) => (counts[b] > counts[a] ? b : a));
    return this.statusOrder.map((status) => ({
      status,
      label: ORDER_STATUS[status].label,
      count: counts[status],
      width: counts[status] ? Math.max(3, Math.sqrt(counts[status] / max) * 100) : 0,
      accent: status === top && counts[status] > 0,
    }));
  });

  readonly customerSplit = computed(() => {
    const c = this.data()?.newVsReturningCustomers ?? { new: 0, returning: 0 };
    const total = c.new + c.returning;
    return { ...c, newWidth: total ? (c.new / total) * 100 : 0 };
  });

  readonly orders = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return (this.data()?.recentOrders ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!q || o.orderCode.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)),
    );
  });

  readonly allSelected = computed(() => {
    const rows = this.orders();
    return rows.length > 0 && rows.every((o) => this.selected().has(o.id));
  });

  constructor() {
    toObservable(computed(() => [this.range(), this.reload()] as const))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(([range]) =>
          this.api.overview(range).pipe(
            catchError((err: unknown) => {
              this.error.set(parseApiError(err).message);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        if (data) this.data.set(data);
        this.loading.set(false);
      });
  }

  retry(): void {
    this.reload.update((n) => n + 1);
  }

  setRange(range: OverviewRange): void {
    this.range.set(range);
  }

  rankWidth(items: { quantity: number }[], quantity: number): number {
    const max = Math.max(1, ...items.map((i) => i.quantity));
    return (quantity / max) * 100;
  }

  deltaClass(value: number | null, goodWhenUp: boolean): string {
    if (value === null || value === 0) return '';
    return value > 0 === goodWhenUp ? 'up' : 'down';
  }

  arrow(value: number | null): string {
    if (value === null || value === 0) return '';
    return value > 0 ? '▲' : '▼';
  }

  toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(): void {
    const ids = this.orders().map((o) => o.id);
    this.selected.set(this.allSelected() ? new Set() : new Set(ids));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
  }

  openPopup(order: RecentOrder, event: Event): void {
    // Bấm vào đâu trong hàng cũng mở; trả focus về nút mã đơn của hàng đó khi đóng popup.
    const row = event.currentTarget as HTMLElement;
    this.popupOpener = row.querySelector<HTMLElement>('button.cv-id-btn') ?? row;
    this.openOrder.set(order);
    // Đưa focus vào popup sau khi render (mục 9: truy cập).
    setTimeout(() => this.popupRef()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closePopup(): void {
    if (!this.openOrder()) return;
    this.openOrder.set(null);
    this.popupOpener?.focus();
  }

  deliveredByLabel(order: RecentOrder): string {
    if (order.deliveredBy === 'TEAM') return 'Đội xe';
    if (order.deliveredBy === 'CARRIER') return 'Đối tác';
    return 'Chưa phân';
  }

  paymentLabel(order: RecentOrder): string {
    if (order.paymentMethod === 'COD') return 'COD';
    return order.collectionType === 'DEPOSIT' ? 'Cọc QR' : 'Chuyển khoản QR';
  }

  /** Xuất đơn đang chọn ra CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
  exportSelected(): void {
    const rows = (this.data()?.recentOrders ?? []).filter((o) => this.selected().has(o.id));
    this.downloadCsv(
      'don-hang.csv',
      [['Mã đơn', 'Khách hàng', 'Giao bởi', 'Trạng thái', 'Tổng', 'Ngày']].concat(
        rows.map((o) => [
          o.orderCode,
          o.customerName,
          this.deliveredByLabel(o),
          ORDER_STATUS[o.status].label,
          String(o.totalAmount),
          fmt.formatDate(o.createdAt),
        ]),
      ),
    );
  }

  /** Xuất báo cáo tổng quan của kỳ đang xem. */
  exportReport(): void {
    const d = this.data();
    if (!d) return;
    const rows: string[][] = [
      ['Chỉ số', 'Giá trị'],
      ['Kỳ', this.periodLabel()],
      ['Doanh thu kỳ', String(d.revenue.selected)],
      ['Doanh thu hôm nay', String(d.revenue.today)],
      ['Doanh thu 7 ngày', String(d.revenue.last7d)],
      ['Doanh thu 30 ngày', String(d.revenue.last30d)],
      ['Giá trị trung bình/đơn', String(d.averageOrderValue)],
      ['Tỷ lệ hủy (%)', String(d.cancelRate)],
      ['Tỷ lệ đổi/trả (%)', String(d.returnRate)],
      ['Khách mới', String(d.newVsReturningCustomers.new)],
      ['Khách quay lại', String(d.newVsReturningCustomers.returning)],
      ['Đơn chờ xác nhận quá hạn', String(d.overdueConfirmationCount)],
      ...this.statusOrder.map((s) => [`Đơn ${ORDER_STATUS[s].label}`, String(d.ordersByStatus[s])]),
      ...d.revenue.byMonth.map((m) => [`Doanh thu T${m.month}/${m.year}`, String(m.revenue)]),
      ...d.topProducts.map((p, i) => [`Top sản phẩm ${i + 1}: ${p.name}`, String(p.quantity)]),
      ...d.topCategories.map((c, i) => [`Top danh mục ${i + 1}: ${c.name}`, String(c.quantity)]),
    ];
    this.downloadCsv(`bao-cao-tong-quan-${d.range}.csv`, rows);
  }

  print(): void {
    window.print();
  }

  private downloadCsv(filename: string, rows: string[][]): void {
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
