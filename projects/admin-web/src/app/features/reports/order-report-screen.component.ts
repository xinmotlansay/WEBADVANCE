import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ORDER_STATUS_LABEL,
  AdminOrderStatus as OrderStatus,
  REPORT_PERIOD_LABEL,
  type OrderReport,
  type ReportPeriod,
} from 'shared';
import { AdminReportApi } from '../../core/api/admin-dashboard.api';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, PercentVnPipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import {
  BarChartComponent,
  BarListComponent,
  RatioBarComponent,
} from '../../shared/ui/charts/charts.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import {
  ErrorStateComponent,
  TableSkeletonComponent,
} from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: 'month', label: 'Tháng này' },
];

@Component({
  selector: 'app-order-report-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    BarChartComponent,
    BarListComponent,
    RatioBarComponent,
    StatusBadgeComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    VndPipe,
    ShortVndPipe,
    PercentVnPipe,
    DateVnPipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Báo cáo đơn hàng"
        subtitle="Doanh thu, tỷ lệ hủy và cơ cấu đơn theo khoảng thời gian."
        [showSearch]="false"
      >
        <button type="button" class="cv-btn cv-btn--secondary" (click)="print()">
          <app-icon name="printer" size="sm" />
          In báo cáo
        </button>
        <button
          type="button"
          class="cv-btn cv-btn--primary"
          (click)="exportCsv()"
          [disabled]="loading() || !report()"
        >
          <app-icon name="download" size="sm" />
          Xuất CSV
        </button>
      </app-page-header>

      <div class="cv-filter-row" role="group" aria-label="Khoảng thời gian báo cáo">
        @for (period of periods; track period.value) {
          <button
            type="button"
            class="cv-chip"
            [class.cv-chip--active]="activePeriod() === period.value"
            [attr.aria-pressed]="activePeriod() === period.value"
            (click)="selectPeriod(period.value)"
          >
            {{ period.label }}
          </button>
        }
        <span class="cv-small cv-muted period-range">
          @if (report(); as data) {
            {{ data.range.from | dateVn }} – {{ data.range.to | dateVn }}
          }
        </span>
      </div>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5, 6, 7]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (report()) {
        @if (report(); as data) {
          <div class="cv-stack">
            <section class="cv-kpi" aria-label="Chỉ số báo cáo">
              <div class="cv-kpi__cell">
                <p class="cv-kpi__label">Tổng đơn</p>
                <p class="cv-kpi__value">{{ data.totalOrders }}</p>
                <p class="cv-kpi__delta">{{ data.range.label }}</p>
              </div>
              <div class="cv-kpi__cell">
                <p class="cv-kpi__label">Doanh thu</p>
                <p class="cv-kpi__value">{{ data.totalRevenue | shortVnd }}</p>
                <p class="cv-kpi__delta cv-kpi__delta--up">Đã giao thành công</p>
              </div>
              <div class="cv-kpi__cell">
                <p class="cv-kpi__label">Giá trị đơn TB</p>
                <p class="cv-kpi__value">{{ data.averageOrderValue | shortVnd }}</p>
                <p class="cv-kpi__delta">Trên đơn đã giao</p>
              </div>
              <div class="cv-kpi__cell">
                <p class="cv-kpi__label">Tỷ lệ hủy</p>
                <p class="cv-kpi__value">{{ data.cancelRate | percentVn }}</p>
                <p class="cv-kpi__delta" [class.cv-kpi__delta--down]="data.cancelRate > 5">
                  Mục tiêu dưới 5%
                </p>
              </div>
              <div class="cv-kpi__cell">
                <p class="cv-kpi__label">Tỷ lệ đổi/trả</p>
                <p class="cv-kpi__value">{{ data.returnRate | percentVn }}</p>
                <p class="cv-kpi__delta">Trên tổng đơn trong kỳ</p>
              </div>
            </section>

            <div class="cv-grid-2">
              <section class="cv-panel" aria-labelledby="revenue-title">
                <div class="cv-panel__head">
                  <h2 class="cv-panel__title" id="revenue-title">Doanh thu theo tháng</h2>
                  <span class="cv-tag">VND</span>
                </div>
                <app-bar-chart label="" unit="VND" [data]="monthBars()" />
              </section>

              <section class="cv-panel" aria-labelledby="status-title">
                <div class="cv-panel__head">
                  <h2 class="cv-panel__title" id="status-title">Cơ cấu theo trạng thái</h2>
                  <span class="cv-small cv-muted">{{ data.totalOrders }} đơn</span>
                </div>
                <div class="status-bars">
                  @for (entry of statusEntries(); track entry.status) {
                    <div class="status-bar">
                      <app-status-badge kind="order" [value]="entry.status" />
                      <app-ratio-bar label="" [value]="entry.count" [max]="data.totalOrders" />
                      <span class="cv-num cv-small">{{ entry.count }}</span>
                    </div>
                  }
                </div>
              </section>
            </div>

            <div class="cv-grid-2">
              <section class="cv-panel" aria-labelledby="top-title">
                <div class="cv-panel__head">
                  <h2 class="cv-panel__title" id="top-title">Top sản phẩm theo doanh thu</h2>
                </div>
                <app-bar-list [items]="data.topProducts" />
              </section>

              <section class="cv-panel" aria-labelledby="note-title">
                <div class="cv-panel__head">
                  <h2 class="cv-panel__title" id="note-title">Ghi chú báo cáo</h2>
                </div>
                <ul class="rule-list cv-small cv-muted">
                  <li>Doanh thu chỉ tính đơn đã giao thành công.</li>
                  <li>Tỷ lệ hủy = đơn hủy / tổng đơn trong kỳ.</li>
                  <li>Đơn quá hạn xác nhận: {{ data.overdueConfirmationCount }}.</li>
                  <li>Báo cáo không hiển thị thông tin cá nhân của khách.</li>
                </ul>
              </section>
            </div>
          </div>
        }
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan báo cáo">
      <div class="cv-rail__hero">
        <p class="cv-label">Doanh thu kỳ này</p>
        <p class="cv-hero-num">{{ report()?.totalRevenue ?? 0 | shortVnd }}</p>
        <p class="cv-small cv-muted">{{ report()?.range?.label || '—' }}</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Chỉ số chính</p>
        <dl class="cv-kv" style="grid-template-columns: 1fr auto">
          <dt>Tổng đơn</dt>
          <dd class="cv-num">{{ report()?.totalOrders ?? 0 }}</dd>
          <dt>Giá trị TB</dt>
          <dd class="cv-num">{{ report()?.averageOrderValue ?? 0 | vnd }}</dd>
          <dt>Tỷ lệ hủy</dt>
          <dd class="cv-num">{{ report()?.cancelRate ?? 0 | percentVn }}</dd>
          <dt>Tỷ lệ đổi/trả</dt>
          <dd class="cv-num">{{ report()?.returnRate ?? 0 | percentVn }}</dd>
          <dt>Quá hạn xác nhận</dt>
          <dd class="cv-num">{{ report()?.overdueConfirmationCount ?? 0 }}</dd>
        </dl>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Cách đọc báo cáo</p>
        <p class="cv-small cv-muted">
          So sánh doanh thu theo tháng để nhận biết mùa cao điểm. Tỷ lệ hủy tăng bất thường thường
          đến từ tồn kho hoặc xác nhận chậm.
        </p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Xuất dữ liệu</p>
        <p class="cv-small cv-muted">
          Báo cáo xuất theo đúng kỳ đang chọn, không chứa dữ liệu cá nhân.
        </p>
      </div>
    </aside>
  `,
  styles: [
    `
      .period-range {
        margin-left: auto;
        align-self: center;
      }

      .status-bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .status-bar {
        display: grid;
        grid-template-columns: 150px 1fr 40px;
        align-items: center;
        gap: 10px;
      }

      .rule-list {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      @media (max-width: 767px) {
        .status-bar {
          grid-template-columns: 1fr;
        }

        .period-range {
          margin-left: 0;
          width: 100%;
        }
      }
    `,
  ],
})
export class OrderReportScreenComponent {
  private readonly api = inject(AdminReportApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly periods = PERIODS;
  readonly activePeriod = signal<ReportPeriod>('30d');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly report = signal<OrderReport | null>(null);

  readonly monthBars = computed(() =>
    (this.report()?.byMonth ?? []).map((item, index) => ({
      label: item.label,
      value: item.revenue,
      current: index === (this.report()?.byMonth.length ?? 0) - 1,
    })),
  );

  readonly statusEntries = computed(() =>
    Object.values(OrderStatus).map((status) => ({
      status,
      count: this.report()?.byStatus[status] ?? 0,
    })),
  );

  constructor() {
    this.load();
  }

  selectPeriod(period: ReportPeriod): void {
    this.activePeriod.set(period);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .get(this.activePeriod())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được báo cáo. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });
  }

  print(): void {
    window.print();
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) {
      this.notifications.show('Chưa có dữ liệu báo cáo để xuất.', 'error');
      return;
    }

    const rows = [
      { section: 'Tổng quan', name: 'Thời gian', value: report.range.label },
      { section: 'Tổng quan', name: 'Tổng đơn', value: report.totalOrders },
      { section: 'Tổng quan', name: 'Doanh thu', value: report.totalRevenue },
      { section: 'Tổng quan', name: 'Giá trị đơn trung bình', value: report.averageOrderValue },
      { section: 'Tổng quan', name: 'Tỷ lệ hủy', value: `${report.cancelRate}%` },
      { section: 'Tổng quan', name: 'Tỷ lệ đổi trả', value: `${report.returnRate}%` },
      {
        section: 'Tổng quan',
        name: 'Đơn quá hạn xác nhận',
        value: report.overdueConfirmationCount,
      },
      ...Object.entries(report.byStatus).map(([status, count]) => ({
        section: 'Theo trạng thái',
        name: ORDER_STATUS_LABEL[status as OrderStatus],
        value: count,
      })),
      ...report.byMonth.map((item) => ({
        section: 'Doanh thu theo tháng',
        name: item.label,
        value: item.revenue,
      })),
      ...report.topProducts.map((item) => ({
        section: 'Sản phẩm bán chạy',
        name: item.name,
        value: item.value,
      })),
    ];
    const downloaded = downloadCsv(
      `bao-cao-don-hang-${this.activePeriod()}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { label: 'Nhóm', value: (row) => row.section },
        { label: 'Chỉ số', value: (row) => row.name },
        { label: 'Giá trị', value: (row) => row.value },
      ],
      rows,
    );
    this.notifications.show(
      downloaded
        ? `Đã tải xuống báo cáo ${REPORT_PERIOD_LABEL[this.activePeriod()]}.`
        : 'Không có dữ liệu báo cáo để xuất.',
      downloaded ? 'info' : 'error',
    );
  }
}
