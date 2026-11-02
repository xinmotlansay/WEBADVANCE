import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  CARAVESO_CARRIER,
  LateCompensationStatus,
  AdminOrderStatus as OrderStatus,
  type LateCompensationRequest,
  type AdminOrderDetail as OrderDetail,
  type OrderListItem,
} from 'shared';
import { AdminDashboardApi } from '../../core/api/admin-dashboard.api';
import { AdminOrderApi } from '../../core/api/admin-order.api';
import { DateVnPipe, OrderCodePipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import { ConfirmDialogComponent } from '../../shared/ui/dialogs/confirm-dialog.component';
import { ReasonDialogComponent } from '../../shared/ui/dialogs/reason-dialog.component';
import { FilterChipComponent, type FilterOption } from '../../shared/ui/filters/filter-chip.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { DetailPopupComponent } from '../../shared/ui/popup/detail-popup.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  TableSkeletonComponent,
} from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

const STAGE_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả vận chuyển' },
  { value: OrderStatus.CONFIRMED, label: 'Chờ bàn giao' },
  { value: OrderStatus.HANDED_OVER, label: 'Đã bàn giao' },
  { value: OrderStatus.SHIPPING, label: 'Đang giao' },
  { value: OrderStatus.DELIVERED, label: 'Đã giao' },
];

const CARRIERS = [CARAVESO_CARRIER, 'GHN', 'GHTK', 'Viettel Post'];

@Component({
  selector: 'app-shipping-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PageHeaderComponent,
    IconComponent,
    FilterChipComponent,
    StatusBadgeComponent,
    DetailPopupComponent,
    ConfirmDialogComponent,
    ReasonDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    OrderCodePipe,
    DateVnPipe,
    VndPipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Vận chuyển & lịch giao"
        subtitle="Bàn giao đơn, gán đơn vị vận chuyển và theo dõi lịch giao lắp đặt."
        searchId="shipping-search"
        searchPlaceholder="Mã đơn, khách, mã vận đơn…"
        [searchValue]="keyword()"
        (searchChange)="keyword.set($event)"
      >
        <button type="button" class="cv-btn cv-btn--secondary" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
        <button type="button" class="cv-btn cv-btn--primary" (click)="printHandover()">
          <app-icon name="printer" size="sm" />
          In phiếu bàn giao
        </button>
      </app-page-header>

      <section class="cv-panel" style="margin-bottom: 20px" aria-labelledby="late-title">
        <div class="cv-panel__head">
          <h2 class="cv-panel__title" id="late-title">Duyệt voucher bù giao trễ</h2>
          <span class="cv-tag">{{ pendingCompensations().length }} chờ duyệt</span>
        </div>
        @if (pendingCompensations().length === 0) {
          <p class="cv-small cv-muted">Không có yêu cầu nào chờ duyệt.</p>
        } @else {
          <div class="late-grid">
            @for (item of pendingCompensations(); track item.id) {
              <article class="late-card">
                <div class="cv-spread">
                  <span class="cv-small" style="font-weight: 600">{{ item.orderCode | orderCode }}</span>
                  <span class="cv-badge cv-badge--warning">Trễ {{ item.daysLate }} ngày</span>
                </div>
                <p class="cv-small cv-muted">{{ item.customerName }} · {{ item.customerPhone }}</p>
                <dl class="cv-kv" style="grid-template-columns: 100px 1fr; font-size: 13px">
                  <dt>Dự kiến giao</dt><dd>{{ item.estimatedDeliveryDate | dateVn }}</dd>
                  <dt>Thực tế</dt><dd>{{ item.actualDeliveryDate ? (item.actualDeliveryDate | dateVn) : 'Chưa giao' }}</dd>
                  <dt>Voucher</dt><dd class="cv-num">{{ item.voucherValue | vnd }}</dd>
                </dl>
                <div class="late-card__actions">
                  <button type="button" class="cv-btn cv-btn--sm cv-btn--secondary" (click)="openReject(item)">Từ chối</button>
                  <button type="button" class="cv-btn cv-btn--sm cv-btn--accent" [disabled]="busyId() === item.id" (click)="approve(item)">Duyệt</button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <div class="cv-filter-row">
        <app-filter-chip
          label="Công đoạn"
          [options]="stageOptions"
          [value]="stage()"
          (valueChange)="stage.set($event)"
        />
        @if (stage() !== 'ALL' || keyword()) {
          <button type="button" class="cv-chip" (click)="resetFilters()">
            <app-icon name="x" size="sm" />
            Xóa bộ lọc
          </button>
        }
      </div>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5, 6]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (rows().length === 0) {
        <app-empty-state
          icon="truck"
          title="Không có đơn trong công đoạn này"
          message="Chọn công đoạn khác hoặc xóa bộ lọc để xem toàn bộ đơn vận chuyển."
          actionLabel="Xóa bộ lọc"
          (action)="resetFilters()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">Đơn hàng theo công đoạn vận chuyển</caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Đơn vị / đội xe</th>
                  <th scope="col">Mã vận đơn</th>
                  <th scope="col">Dự kiến giao</th>
                  <th scope="col">Giao lại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                @for (order of rows(); track order.id) {
                  <tr>
                    <td><span class="cv-table__link">{{ order.orderCode | orderCode }}</span></td>
                    <td>
                      <span class="cv-table__customer">
                        <span class="cv-avatar" aria-hidden="true">{{ initials(order.customerName) }}</span>
                        {{ order.customerName || 'Chưa cập nhật' }}
                      </span>
                    </td>
                    <td>{{ order.shipment?.assignedTeam || order.shipment?.carrier || 'Chưa gán' }}</td>
                    <td>{{ order.shipment?.trackingCode || '—' }}</td>
                    <td class="cv-nowrap">{{ order.shipment?.estimatedDeliveryDate ? (order.shipment!.estimatedDeliveryDate | dateVn) : '—' }}</td>
                    <td class="cv-num">{{ order.shipment?.redeliveryCount ?? 0 }}/2</td>
                    <td><app-status-badge kind="order" [value]="order.status" /></td>
                    <td>
                      <button type="button" class="cv-btn cv-btn--sm cv-btn--secondary" (click)="openOrder(order)">
                        <app-icon name="settings" size="sm" />
                        Xử lý
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan vận chuyển">
      <div class="cv-rail__hero">
        <p class="cv-label">Đơn đang theo dõi</p>
        <p class="cv-hero-num">{{ rows().length }}</p>
        <p class="cv-small cv-muted">Bàn giao trong ngày: {{ handoverToday() }}</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Theo công đoạn</p>
        <ul class="count-list">
          @for (item of stageCounts(); track item.status) {
            <li class="count-item">
              <app-status-badge kind="order" [value]="item.status" />
              <span class="cv-num cv-small">{{ item.count }}</span>
            </li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Quy tắc bàn giao</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Đơn cồng kềnh do CaraVeso giao kèm lắp đặt.</li>
          <li>Chỉ bàn giao khi đơn đã xác nhận và đủ hàng.</li>
          <li>Giao lại tối đa 2 lần, sau đó hoàn về kho.</li>
          <li>Voucher bù trễ 100.000đ do hệ thống đề xuất.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Đơn vị đang dùng</p>
        <p class="cv-small cv-muted">CaraVeso (đội xe nội bộ), GHN, GHTK, Viettel Post.</p>
      </div>
    </aside>

    @if (active(); as order) {
      <app-detail-popup [open]="active() !== null" [title]="active() ? ('Vận chuyển ' + active()!.orderCode) : 'Vận chuyển'" (closed)="active.set(null)">

        <div popupBody class="cv-stack">
          <div class="cv-spread">
            <app-status-badge kind="order" [value]="order.status" />
            <span class="cv-small cv-muted">{{ order.customerName }}</span>
          </div>

          <div class="cv-field">
            <label class="cv-field__label" for="carrier">Đơn vị vận chuyển</label>
            <select class="cv-select" id="carrier" [value]="carrier()" (change)="carrier.set($any($event.target).value)">
              @for (name of carriers; track name) {
                <option [value]="name">{{ name }}</option>
              }
            </select>
          </div>

          <div class="cv-field">
            <label class="cv-field__label" for="tracking">Mã vận đơn</label>
            <input class="cv-input" id="tracking" [value]="trackingCode()" (input)="trackingCode.set($any($event.target).value)" placeholder="Ví dụ GHN100200" />
          </div>

          <div class="cv-field">
            <label class="cv-field__label" for="team">Đội xe / ghi chú bàn giao</label>
            <input class="cv-input" id="team" [value]="assignedTeam()" (input)="assignedTeam.set($any($event.target).value)" placeholder="Đội xe 01 (chỉ với CaraVeso)" />
          </div>

          <div class="cv-field">
            <label class="cv-field__label" for="install">Lịch lắp đặt (nếu có)</label>
            <input class="cv-input" id="install" type="datetime-local" [value]="installationSchedule()" (input)="installationSchedule.set($any($event.target).value)" />
          </div>

          @if (order.shipment?.failureReason) {
            <div class="cv-alert-box">Lý do giao thất bại trước đó: {{ order.shipment!.failureReason }}</div>
          }

          @if (activeError()) {
            <div class="cv-error" role="alert">{{ activeError() }}</div>
          }
        </div>
        <div popupFooter>
          <button type="button" class="cv-btn cv-btn--secondary" [disabled]="busy()" (click)="saveShipment()">Lưu thông tin</button>
          @if (order.status === 'CONFIRMED') {
            <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="advance(order, 'HANDED_OVER')">Bàn giao</button>
          }
          @if (order.status === 'HANDED_OVER') {
            <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="advance(order, 'SHIPPING')">Bắt đầu giao</button>
          }
          @if (order.status === 'SHIPPING') {
            <button type="button" class="cv-btn cv-btn--accent" [disabled]="busy()" (click)="advance(order, 'DELIVERED')">Đã giao</button>
          }
        </div>
    </app-detail-popup>
      }

    <app-confirm-dialog
      [open]="confirmAdvance() !== null"
      title="Xác nhận chuyển công đoạn"
      [message]="advanceMessage()"
      confirmLabel="Xác nhận"
      [loading]="busy()"
      (confirmed)="commitAdvance()"
      (cancelled)="confirmAdvance.set(null)"
    />

    <app-reason-dialog
      [open]="rejecting() !== null"
      title="Từ chối voucher bù trễ"
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
      .late-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px;
      }

      .late-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
      }

      .late-card__actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }

      .count-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .count-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .rule-list {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    `,
  ],
})
export class ShippingScreenComponent {
  private readonly orderApi = inject(AdminOrderApi);
  private readonly dashboardApi = inject(AdminDashboardApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly stageOptions = STAGE_OPTIONS;
  readonly carriers = CARRIERS;

  readonly keyword = signal('');
  readonly stage = signal<string>('ALL');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly allOrders = signal<OrderDetail[]>([]);

  readonly compensations = signal<LateCompensationRequest[]>([]);
  readonly rejecting = signal<LateCompensationRequest | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly active = signal<OrderDetail | null>(null);
  readonly carrier = signal('');
  readonly trackingCode = signal('');
  readonly assignedTeam = signal('');
  readonly installationSchedule = signal('');
  readonly activeError = signal('');
  readonly busy = signal(false);
  readonly confirmAdvance = signal<{ order: OrderDetail; status: OrderStatus } | null>(null);

  readonly pendingCompensations = computed(() =>
    this.compensations().filter((item) => item.status === LateCompensationStatus.PENDING),
  );

  readonly rows = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    const stage = this.stage();
    return this.allOrders().filter((order) => {
      if (stage !== 'ALL' && order.status !== stage) return false;
      if (!keyword) return true;
      return (
        order.orderCode.toLowerCase().includes(keyword) ||
        order.customer.fullName.toLowerCase().includes(keyword) ||
        order.customer.phoneNumber.includes(keyword) ||
        (order.shipment?.trackingCode ?? '').toLowerCase().includes(keyword)
      );
    });
  });

  readonly stageCounts = computed(() => {
    const relevant = this.allOrders();
    return STAGE_OPTIONS.filter((option) => option.value !== 'ALL').map((option) => ({
      status: option.value as OrderStatus,
      label: option.label,
      count: relevant.filter((order) => order.status === option.value).length,
    }));
  });

  readonly handoverToday = computed(
    () =>
      this.allOrders().filter((order) => order.status === OrderStatus.HANDED_OVER).length,
  );

  readonly advanceMessage = computed(() => {
    const target = this.confirmAdvance();
    if (!target) return '';
    const order = target.order;
    if (target.status === 'HANDED_OVER') {
      return `Bàn giao đơn ${order.orderCode} cho ${this.carrier()}${this.trackingCode() ? ' · ' + this.trackingCode() : ''}. Sau bước này không thể hủy trực tiếp.`;
    }
    if (target.status === 'SHIPPING') {
      return `Bắt đầu giao đơn ${order.orderCode}. Khách sẽ nhận thông báo đang giao.`;
    }
    return `Ghi nhận đơn ${order.orderCode} đã giao thành công. Hệ thống sẽ ghi nhận doanh thu và mở quyền đổi trả/bảo hành.`;
  });

  constructor() {
    this.load();
    this.loadCompensations();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.orderApi
      .list({ status: 'ALL', page: 1, limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const relevant = [OrderStatus.CONFIRMED, OrderStatus.HANDED_OVER, OrderStatus.SHIPPING, OrderStatus.DELIVERED];
          const ids = response.data.filter((item) => relevant.includes(item.status)).map((item) => item.id);
          if (!ids.length) {
            this.allOrders.set([]);
            this.loading.set(false);
            return;
          }
          const loaded: OrderDetail[] = [];
          let pending = ids.length;
          for (const id of ids) {
            this.orderApi.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
              next: (detail) => {
                loaded.push(detail);
                pending -= 1;
                if (pending === 0) {
                  this.allOrders.set(loaded);
                  this.loading.set(false);
                }
              },
              error: () => {
                pending -= 1;
                if (pending === 0) {
                  this.allOrders.set(loaded);
                  this.loading.set(false);
                }
              },
            });
          }
        },
        error: () => {
          this.error.set('Không tải được danh sách vận chuyển. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });
  }

  loadCompensations(): void {
    this.dashboardApi
      .lateCompensations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.compensations.set(items), error: () => undefined });
  }

  resetFilters(): void {
    this.keyword.set('');
    this.stage.set('ALL');
  }

  initials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'KH';
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  printHandover(): void {
    this.notifications.show('Đã gửi lệnh in phiếu bàn giao cho đơn đang chọn.');
  }

  openOrder(order: OrderDetail): void {
    this.active.set(order);
    this.activeError.set('');
    this.carrier.set(order.shipment?.carrier ?? CARAVESO_CARRIER);
    this.trackingCode.set(order.shipment?.trackingCode ?? '');
    this.assignedTeam.set(order.shipment?.assignedTeam ?? '');
    this.installationSchedule.set(
      order.shipment?.installationSchedule ? order.shipment.installationSchedule.slice(0, 16) : '',
    );
  }

  saveShipment(): void {
    const order = this.active();
    if (!order) return;
    if (this.carrier() !== CARAVESO_CARRIER && !this.trackingCode().trim()) {
      this.activeError.set('Đơn vị ngoài cần nhập mã vận đơn.');
      return;
    }
    this.busy.set(true);
    this.activeError.set('');
    this.orderApi
      .updateShipment(order.id, {
        carrier: this.carrier(),
        trackingCode: this.trackingCode().trim() || null,
        assignedTeam: this.assignedTeam().trim() || null,
        installationSchedule: this.installationSchedule() ? new Date(this.installationSchedule()).toISOString() : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.patch(updated);
          this.active.set(updated);
          this.notifications.show(`Đã lưu thông tin vận chuyển đơn ${updated.orderCode}.`);
        },
        error: () => {
          this.busy.set(false);
          this.notifications.show('Không lưu được thông tin vận chuyển.', 'error');
        },
      });
  }

  advance(order: OrderDetail, status: OrderStatus): void {
    this.confirmAdvance.set({ order, status });
  }

  commitAdvance(): void {
    const target = this.confirmAdvance();
    if (!target) return;
    this.busy.set(true);
    const note =
      target.status === 'HANDED_OVER'
        ? `Bàn giao cho ${this.carrier()}${this.trackingCode() ? ' · ' + this.trackingCode() : ''}`
        : undefined;
    this.orderApi
      .updateStatus(target.order.id, { status: target.status, note })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.confirmAdvance.set(null);
          this.patch(updated);
          this.active.set(updated);
          this.notifications.show(`Đã cập nhật đơn ${updated.orderCode}.`);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const message = error instanceof Error ? error.message : 'Không cập nhật được trạng thái.';
          this.notifications.show(message, 'error');
        },
      });
  }

  approve(item: LateCompensationRequest): void {
    this.busyId.set(item.id);
    this.dashboardApi
      .approveCompensation(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          this.compensations.update((list) => list.map((entry) => (entry.id === updated.id ? updated : entry)));
          this.notifications.show(`Đã duyệt voucher cho ${updated.orderCode}.`);
        },
        error: () => {
          this.busyId.set(null);
          this.notifications.show('Không duyệt được voucher.', 'error');
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
    this.dashboardApi
      .rejectCompensation(item.id, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          this.rejecting.set(null);
          this.compensations.update((list) => list.map((entry) => (entry.id === updated.id ? updated : entry)));
          this.notifications.show(`Đã từ chối voucher ${updated.orderCode}.`);
        },
        error: () => {
          this.busyId.set(null);
          this.notifications.show('Không từ chối được voucher.', 'error');
        },
      });
  }

  private patch(updated: OrderDetail): void {
    this.allOrders.update((list) => list.map((order) => (order.id === updated.id ? updated : order)));
  }
}
