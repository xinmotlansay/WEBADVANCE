import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  ORDER_STATUS_LABEL,
  AdminOrderStatus as OrderStatus,
  type LateCompensationRequest,
  type OrderDashboardSummary,
} from 'shared';
import { AdminDashboardApi } from '../../core/api/admin-dashboard.api';
import { DateVnPipe, PercentVnPipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import { BarListComponent, RatioBarComponent } from '../../shared/ui/charts/charts.component';
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

@Component({
  selector: 'app-dashboard-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    RatioBarComponent,
    BarListComponent,
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
        subtitle="Theo dõi đơn mới, doanh thu và các việc cần xử lý trong ngày."
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
          <section class="cv-kpi" aria-label="Chỉ số đơn hàng">
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
            <div class="cv-kpi__cell cv-kpi__cell--ok">
              <div class="cv-kpi__icon"><app-icon name="check-circle" size="sm" /></div>
              <p class="cv-kpi__label">Giao thành công</p>
              <p class="cv-kpi__value">{{ data.countsByStatus.DELIVERED }}</p>
              <p class="cv-kpi__delta">Tỷ lệ đã giao {{ deliveredRate() | percentVn }}</p>
            </div>
            <div class="cv-kpi__cell">
              <div class="cv-kpi__icon"><app-icon name="x-circle" size="sm" /></div>
              <p class="cv-kpi__label">Đã hủy</p>
              <p class="cv-kpi__value">{{ data.countsByStatus.CANCELLED }}</p>
              <p class="cv-kpi__delta">Trong tổng {{ data.totalOrders }} đơn</p>
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

          <div class="cv-grid-2">
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

            <section class="cv-panel" aria-labelledby="top-title">
              <div class="cv-panel__head">
                <h2 class="cv-panel__title" id="top-title">Top sản phẩm theo doanh thu</h2>
              </div>
              <app-bar-list [items]="topProducts()" />
            </section>
          </div>
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
  readonly deliveredRate = computed(() => {
    const data = this.summary();
    return data?.totalOrders ? (data.countsByStatus.DELIVERED / data.totalOrders) * 100 : 0;
  });

  readonly topProducts = computed(() => this.summary()?.topProducts ?? []);
  readonly recentOrders = computed(() =>
    (this.summary()?.recentOrders ?? []).map(
      (order) => `#${order.orderCode} · ${ORDER_STATUS_LABEL[order.status]}`,
    ),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

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
}
