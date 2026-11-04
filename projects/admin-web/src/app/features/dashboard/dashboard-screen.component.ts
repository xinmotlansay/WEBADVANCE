import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  ORDER_STATUS_LABEL,
  AdminOrderStatus as OrderStatus,
  REPORT_PERIOD_LABEL,
  type LateCompensationRequest,
  type OrderDashboardSummary,
  type OrderReport,
  type ReportPeriod,
} from 'shared';
import { AdminDashboardApi, AdminReportApi } from '../../core/api/admin-dashboard.api';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, PercentVnPipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import { BarChartComponent, BarListComponent, RatioBarComponent } from '../../shared/ui/charts/charts.component';
import { ReasonDialogComponent } from '../../shared/ui/dialogs/reason-dialog.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ErrorStateComponent, TableSkeletonComponent } from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

const RATIO_ORDER: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.HANDED_OVER,
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.RETURNING,
  OrderStatus.CANCELLED,
];

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: 'month', label: 'Tháng này' },
];

@Component({
  selector: 'app-dashboard-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    RatioBarComponent,
    BarListComponent,
    BarChartComponent,
    StatusBadgeComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    ReasonDialogComponent,
    VndPipe,
    ShortVndPipe,
    PercentVnPipe,
    DateVnPipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Tổng quan đơn hàng"
        subtitle="Đơn mới, việc cần xử lý, doanh thu và báo cáo theo kỳ trong một màn hình."
        searchId="dashboard-search"
        searchPlaceholder="Tìm mã đơn, khách hàng…"
        [searchValue]="keyword()"
        (searchChange)="keyword.set($event)"
        [hasNotifications]="(summary()?.paymentExceptionCount ?? 0) > 0"
      >
        <button type="button" class="cv-btn cv-btn--secondary" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh-cw" size="sm" />
          Làm mới
        </button>
        <button type="button" class="cv-btn cv-btn--secondary" (click)="print()">
          <app-icon name="printer" size="sm" />
          In báo cáo
        </button>
        <button type="button" class="cv-btn cv-btn--secondary" (click)="exportCsv()" [disabled]="!report()">
          <app-icon name="download" size="sm" />
          Xuất CSV
        </button>
        <a class="cv-btn cv-btn--primary" routerLink="/admin/orders">
          <app-icon name="shopping-bag" size="sm" />
          Xem đơn hàng
        </a>
      </app-page-header>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (summary()) {
        @if (summary(); as data) {
        <div class="cv-stack">
          <section class="cv-kpi cv-kpi--3" aria-label="Chỉ số đơn hàng">
            <div class="cv-kpi__cell">
              <div class="cv-kpi__icon"><app-icon name="package" size="sm" /></div>
              <p class="cv-kpi__label">Đơn mới hôm nay</p>
              <p class="cv-kpi__value">{{ data.newOrdersToday }}</p>
              <p class="cv-kpi__delta">Tổng {{ data.totalOrders }} đơn trong hệ thống</p>
            </div>
            <div class="cv-kpi__cell" [class.cv-kpi__cell--urgent]="data.overdueConfirmationCount > 0">
              <div class="cv-kpi__icon"><app-icon name="clock" size="sm" /></div>
              <p class="cv-kpi__label">Chờ xác nhận</p>
              <p class="cv-kpi__value">{{ data.countsByStatus.PENDING_CONFIRMATION }}</p>
              <p class="cv-kpi__delta" [class.cv-kpi__delta--down]="data.overdueConfirmationCount > 0">
                {{ data.overdueConfirmationCount }} đơn quá 20 giờ
              </p>
            </div>
            <div class="cv-kpi__cell">
              <div class="cv-kpi__icon"><app-icon name="truck" size="sm" /></div>
              <p class="cv-kpi__label">Đang giao</p>
              <p class="cv-kpi__value">{{ data.countsByStatus.SHIPPING }}</p>
              <p class="cv-kpi__delta">{{ data.countsByStatus.HANDED_OVER }} đơn đã bàn giao</p>
            </div>
          </section>

          <section class="cv-panel" aria-labelledby="alert-title">
            <div class="cv-panel__head">
              <h2 class="cv-panel__title" id="alert-title">Cần xử lý</h2>
              <span class="cv-tag">Cập nhật {{ data.updatedAt | dateVn: 'datetime' }}</span>
            </div>
            <div class="alert-grid">
              <a class="alert-card" [class.alert-card--urgent]="data.paymentExceptionCount > 0" routerLink="/admin/payments">
                <span class="alert-card__num cv-num">{{ data.paymentExceptionCount }}</span>
                <span class="alert-card__label">Giao dịch chờ đối soát</span>
                <span class="alert-card__hint">Sai nội dung, thiếu/thừa tiền, chuyển muộn</span>
              </a>
              <a class="alert-card" [class.alert-card--urgent]="data.pendingReturnCount > 0" routerLink="/admin/returns">
                <span class="alert-card__num cv-num">{{ data.pendingReturnCount }}</span>
                <span class="alert-card__label">Yêu cầu đổi/trả chờ</span>
                <span class="alert-card__hint">{{ data.pendingRefundCount }} yêu cầu chờ hoàn tiền</span>
              </a>
              <a class="alert-card" [class.alert-card--urgent]="data.pendingWarrantyCount > 0" routerLink="/admin/warranty">
                <span class="alert-card__num cv-num">{{ data.pendingWarrantyCount }}</span>
                <span class="alert-card__label">Bảo hành chờ xác nhận</span>
                <span class="alert-card__hint">Tiếp nhận và hẹn kiểm tra</span>
              </a>
              <a class="alert-card" [class.alert-card--urgent]="data.overdueConfirmationCount > 0" routerLink="/admin/orders">
                <span class="alert-card__num cv-num">{{ data.overdueConfirmationCount }}</span>
                <span class="alert-card__label">Đơn quá hạn xác nhận</span>
                <span class="alert-card__hint">Vượt 20 giờ kể từ khi đặt</span>
              </a>
              <a class="alert-card" [class.alert-card--urgent]="data.pendingLateCompensationCount > 0" routerLink="/admin/shipping">
                <span class="alert-card__num cv-num">{{ data.pendingLateCompensationCount }}</span>
                <span class="alert-card__label">Voucher bù giao trễ chờ duyệt</span>
                <span class="alert-card__hint">Duyệt hoặc từ chối kèm lý do</span>
              </a>
            </div>
          </section>

          <section class="cv-panel" aria-labelledby="ratio-title">
            <div class="cv-panel__head">
              <h2 class="cv-panel__title" id="ratio-title">Phân bổ theo 9 trạng thái</h2>
              <span class="cv-small cv-muted">Tổng {{ data.totalOrders }} đơn</span>
            </div>
            <div class="ratio-grid">
              @for (status of ratioOrder; track status) {
                <div class="ratio-item">
                  <div class="cv-spread">
                    <app-status-badge kind="order" [value]="status" />
                    <span class="cv-num cv-small">{{ data.countsByStatus[status] }}</span>
                  </div>
                  <app-ratio-bar
                    [label]="''"
                    [value]="data.countsByStatus[status]"
                    [max]="data.totalOrders"
                  />
                </div>
              }
            </div>
          </section>

          <section class="cv-panel" aria-labelledby="report-title">
            <div class="cv-panel__head">
              <h2 class="cv-panel__title" id="report-title">Báo cáo theo kỳ</h2>
              <span class="cv-small cv-muted">
                @if (report(); as r) {
                  {{ r.range.from | dateVn }} – {{ r.range.to | dateVn }}
                }
              </span>
            </div>

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
            </div>

            @let r = report();
            @if (reportError()) {
              <p class="cv-small cv-muted">
                {{ reportError() }}
                <button type="button" class="cv-btn cv-btn--sm cv-btn--secondary" (click)="loadReport()">Thử lại</button>
              </p>
            } @else if (r) {
              <div class="cv-kpi" aria-label="Chỉ số báo cáo" [class.is-loading]="reportLoading()">
                <div class="cv-kpi__cell">
                  <p class="cv-kpi__label">Doanh thu</p>
                  <p class="cv-kpi__value">{{ r.totalRevenue | shortVnd }}</p>
                  <p class="cv-kpi__delta cv-kpi__delta--up">Đơn đã giao thành công</p>
                </div>
                <div class="cv-kpi__cell">
                  <p class="cv-kpi__label">Đơn trong kỳ</p>
                  <p class="cv-kpi__value">{{ r.totalOrders }}</p>
                  <p class="cv-kpi__delta">{{ r.range.label }}</p>
                </div>
                <div class="cv-kpi__cell">
                  <p class="cv-kpi__label">Giá trị đơn TB</p>
                  <p class="cv-kpi__value">{{ r.averageOrderValue | shortVnd }}</p>
                  <p class="cv-kpi__delta">Trên đơn đã giao</p>
                </div>
                <div class="cv-kpi__cell">
                  <p class="cv-kpi__label">Tỷ lệ hủy</p>
                  <p class="cv-kpi__value">{{ r.cancelRate | percentVn }}</p>
                  <p class="cv-kpi__delta" [class.cv-kpi__delta--down]="r.cancelRate > 5">Mục tiêu dưới 5%</p>
                </div>
                <div class="cv-kpi__cell">
                  <p class="cv-kpi__label">Tỷ lệ đổi/trả</p>
                  <p class="cv-kpi__value">{{ r.returnRate | percentVn }}</p>
                  <p class="cv-kpi__delta">Trên tổng đơn trong kỳ</p>
                </div>
              </div>

              <div class="cv-grid-2" style="margin-top: 16px">
                <div>
                  <div class="cv-panel__head">
                    <h3 class="cv-panel__title">Doanh thu theo tháng</h3>
                    <span class="cv-tag">VND</span>
                  </div>
                  <app-bar-chart label="" unit="VND" [data]="monthBars()" />
                </div>
                <div>
                  <div class="cv-panel__head">
                    <h3 class="cv-panel__title">Top sản phẩm theo doanh thu</h3>
                  </div>
                  <app-bar-list [items]="r.topProducts" />
                </div>
              </div>
              <p class="cv-small cv-muted" style="margin-top: 12px">
                Doanh thu chỉ tính đơn đã giao thành công. Tỷ lệ hủy = đơn hủy / tổng đơn trong kỳ. Báo cáo không chứa thông tin cá nhân của khách.
              </p>
            } @else {
              <app-table-skeleton [rows]="[1, 2, 3]" />
            }
          </section>

          <section class="cv-panel" aria-labelledby="late-title">
            <div class="cv-panel__head">
              <h2 class="cv-panel__title" id="late-title">Voucher bù giao trễ</h2>
              <span class="cv-tag">{{ pendingCompensations().length }} chờ duyệt</span>
            </div>

            @if (pendingCompensations().length === 0) {
              <p class="cv-small cv-muted">Không còn yêu cầu nào chờ duyệt.</p>
            } @else {
              <ul class="late-list">
                @for (item of pendingCompensations(); track item.id) {
                  <li class="late-item">
                    <div style="min-width: 0">
                      <p class="late-item__code">#{{ item.orderCode }} · {{ item.customerName }}</p>
                      <p class="cv-small cv-muted">
                        Trễ {{ item.daysLate }} ngày · voucher {{ item.voucherValue | vnd }}
                      </p>
                    </div>
                    <div class="late-item__actions">
                      <button
                        type="button"
                        class="cv-btn cv-btn--sm cv-btn--secondary"
                        (click)="openReject(item)"
                      >
                        Từ chối
                      </button>
                      <button
                        type="button"
                        class="cv-btn cv-btn--sm cv-btn--accent"
                        [disabled]="busyId() === item.id"
                        (click)="approve(item)"
                      >
                        Duyệt
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
        }
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan nhanh">
      <div class="cv-rail__hero">
        <p class="cv-label">Doanh thu hôm nay</p>
        <p class="cv-hero-num">{{ (summary()?.revenueToday ?? 0) | shortVnd }}</p>
        <p class="cv-small cv-muted">7 ngày gần nhất: {{ (summary()?.revenueLast7Days ?? 0) | shortVnd }}</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Sức khỏe vận hành</p>
        <div class="cv-stack" style="gap: 14px">
          @if (summary(); as data) {
            <app-ratio-bar
              label="Đơn chờ xác nhận quá hạn"
              [value]="data.overdueConfirmationCount"
              [max]="data.totalOrders"
            />
            <app-ratio-bar
              label="Đổi/trả chờ xử lý"
              [value]="data.pendingReturnCount"
              [max]="data.totalOrders"
            />
            <app-ratio-bar
              label="Thanh toán cần đối soát"
              [value]="data.paymentExceptionCount"
              [max]="data.totalOrders"
            />
          }
        </div>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Đơn gần đây</p>
        <ul class="recent-list">
          @for (node of recentOrders(); track node) {
            <li class="recent-item">
              <span>{{ node }}</span>
              <a class="cv-table__link" routerLink="/admin/orders">Xem</a>
            </li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Ghi chú vận hành</p>
        <p class="cv-small cv-muted">
          Đơn chờ thanh toán quá 15 phút sẽ tự động hủy. Đơn quá 20 giờ chưa xác nhận cần xử lý ngay
          để giữ cam kết giao hàng.
        </p>
      </div>
    </aside>

    <app-reason-dialog
      [open]="rejecting() !== null"
      title="Từ chối voucher bù giao trễ"
      confirmLabel="Từ chối"
      noteLabel="Lý do từ chối"
      [noteRequired]="true"
      [loading]="busyId() !== null"
      (submitted)="reject($event.note)"
      (cancelled)="rejecting.set(null)"
    />
  `,
  styles: [
    `
      .alert-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 12px;
      }

      .alert-card {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 14px;
        border: 1px solid var(--cv-border);
        border-left: 3px solid var(--cv-accent-bar);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
      }

      .alert-card:hover {
        border-color: var(--cv-border-strong);
        background: var(--cv-row-selected);
      }

      .alert-card__num {
        font-size: 26px;
        font-weight: 600;
        line-height: 1.1;
        color: var(--cv-navy);
      }

      .alert-card__label {
        font-size: var(--cv-text-small);
        font-weight: 600;
      }

      .alert-card__hint {
        font-size: var(--cv-text-badge);
        color: var(--cv-muted);
      }

      .alert-card--urgent {
        border-left-color: var(--cv-urgent-fg);
        background: var(--cv-urgent-bg);
      }

      .alert-card--urgent .alert-card__num {
        color: var(--cv-urgent-fg);
      }

      .alert-card--ok .alert-card__num {
        color: var(--cv-ok-fg);
      }

      .ratio-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .ratio-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .late-list,
      .recent-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }

      .late-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--cv-border);
      }

      .late-item:last-child {
        border-bottom: 0;
      }

      .late-item__code {
        font-size: var(--cv-text-small);
        font-weight: 600;
      }

      .late-item__actions {
        display: flex;
        gap: 6px;
        flex: 0 0 auto;
      }

      .recent-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid var(--cv-border);
        font-size: var(--cv-text-small);
      }

      .recent-item:last-child {
        border-bottom: 0;
      }

      @media (max-width: 1100px) {
        .ratio-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 767px) {
        .ratio-grid {
          grid-template-columns: 1fr;
        }

        .late-item {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class DashboardScreenComponent {
  private readonly api = inject(AdminDashboardApi);
  private readonly reportApi = inject(AdminReportApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ratioOrder = RATIO_ORDER;
  readonly keyword = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<OrderDashboardSummary | null>(null);
  readonly compensations = signal<LateCompensationRequest[]>([]);
  readonly rejecting = signal<LateCompensationRequest | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly pendingCompensations = computed(() =>
    this.compensations().filter((item) => item.status === 'PENDING'),
  );

  readonly periods = PERIODS;
  readonly activePeriod = signal<ReportPeriod>('30d');
  readonly report = signal<OrderReport | null>(null);
  readonly reportLoading = signal(true);
  readonly reportError = signal('');
  readonly monthBars = computed(() =>
    (this.report()?.byMonth ?? []).map((item, index, all) => ({
      label: item.label,
      value: item.revenue,
      current: index === all.length - 1,
    })),
  );
  readonly recentOrders = computed(() =>
    (this.summary()?.recentOrders ?? []).map(
      (order) => `#${order.orderCode} · ${ORDER_STATUS_LABEL[order.status]}`,
    ),
  );

  constructor() {
    this.load();
    this.loadReport();
  }

  selectPeriod(period: ReportPeriod): void {
    this.activePeriod.set(period);
    this.loadReport();
  }

  loadReport(): void {
    this.reportLoading.set(true);
    this.reportError.set('');
    this.reportApi
      .get(this.activePeriod())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.reportLoading.set(false);
        },
        error: () => {
          this.reportError.set('Không tải được báo cáo theo kỳ.');
          this.reportLoading.set(false);
        },
      });
  }

  print(): void {
    window.print();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    if (this.report()) this.loadReport();

    this.api
      .summary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được số liệu tổng quan. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });

    this.api
      .lateCompensations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.compensations.set(items),
        error: () => undefined,
      });
  }

  approve(item: LateCompensationRequest): void {
    this.busyId.set(item.id);
    this.api
      .approveCompensation(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.compensations.update((list) =>
            list.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
          this.busyId.set(null);
          this.notifications.show(`Đã duyệt voucher ${updated.voucherValue.toLocaleString('vi-VN')}đ cho #${updated.orderCode}.`);
        },
        error: () => {
          this.busyId.set(null);
          this.notifications.show('Không duyệt được voucher, vui lòng thử lại.', 'error');
        },
      });
  }

  openReject(item: LateCompensationRequest): void {
    this.rejecting.set(item);
  }

  reject(note: string): void {
    const item = this.rejecting();
    if (!item) return;
    this.busyId.set(item.id);
    this.api
      .rejectCompensation(item.id, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.compensations.update((list) =>
            list.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
          this.rejecting.set(null);
          this.busyId.set(null);
          this.notifications.show(`Đã từ chối voucher của #${updated.orderCode}.`);
        },
        error: () => {
          this.busyId.set(null);
          this.notifications.show('Không từ chối được voucher, vui lòng thử lại.', 'error');
        },
      });
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
