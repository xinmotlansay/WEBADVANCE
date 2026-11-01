import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  MAX_REDELIVERY_COUNT,
  AdminOrderStatus as OrderStatus,
  type AdminOrderDetail as OrderDetail,
} from 'shared';
import { AdminOrderApi } from '../../core/api/admin-order.api';
import { OrderCodePipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
import { ConfirmDialogComponent } from '../../shared/ui/dialogs/confirm-dialog.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { DetailPopupComponent } from '../../shared/ui/popup/detail-popup.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  TableSkeletonComponent,
} from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

type ActionKind = 'REDELIVER' | 'RETURN' | 'FINALIZE';

@Component({
  selector: 'app-delivery-failed-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PageHeaderComponent,
    IconComponent,
    StatusBadgeComponent,
    DetailPopupComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    OrderCodePipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Giao thất bại"
        subtitle="Xử lý đơn giao không thành công: giao lại, hoàn về kho hoặc hoàn tất hoàn hàng."
        searchId="failed-search"
        searchPlaceholder="Mã đơn, khách, lý do…"
        [searchValue]="keyword()"
        (searchChange)="keyword.set($event)"
      >
        <button type="button" class="cv-btn cv-btn--secondary" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
        <button type="button" class="cv-btn cv-btn--primary" (click)="load()">
          <app-icon name="truck" size="sm" />
          Đồng bộ vận chuyển
        </button>
      </app-page-header>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (rows().length === 0) {
        <app-empty-state
          icon="package-x"
          title="Không có đơn giao thất bại"
          message="Tất cả đơn đang giao đều đúng tiến độ. Quay lại sau khi có cập nhật từ đơn vị vận chuyển."
          actionLabel="Tải lại"
          (action)="load()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">Đơn giao thất bại cần xử lý</caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Địa chỉ</th>
                  <th scope="col">Lý do</th>
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
                        <span class="cv-avatar" aria-hidden="true">{{ initials(order.customer.fullName) }}</span>
                        {{ order.customer.fullName || 'Chưa cập nhật' }}
                      </span>
                    </td>
                    <td class="cell-address">{{ order.shippingAddress.addressLine }}, {{ order.shippingAddress.district }}</td>
                    <td class="cell-address">{{ order.shipment?.failureReason || 'Chưa ghi lý do' }}</td>
                    <td class="cv-num">{{ order.shipment?.redeliveryCount ?? 0 }}/{{ maxRedelivery }}</td>
                    <td><app-status-badge kind="order" [value]="order.status" /></td>
                    <td>
                      <button type="button" class="cv-btn cv-btn--sm cv-btn--secondary" (click)="open(order)">
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

    <aside class="cv-rail" aria-label="Tổng quan giao thất bại">
      <div class="cv-rail__hero">
        <p class="cv-label">Đơn giao thất bại</p>
        <p class="cv-hero-num">{{ rows().length }}</p>
        <p class="cv-small cv-muted">{{ returnedCount() }} đơn đang hoàn hàng</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Phân loại</p>
        <ul class="cv-stack" style="gap: 10px; list-style: none; margin: 0; padding: 0">
          <li class="cv-spread cv-small"><span>Cần giao lại</span><span class="cv-num">{{ canRedeliver() }}</span></li>
          <li class="cv-spread cv-small"><span>Đã quá lượt giao lại</span><span class="cv-num">{{ overLimitCount() }}</span></li>
          <li class="cv-spread cv-small"><span>Đang hoàn về kho</span><span class="cv-num">{{ returnedCount() }}</span></li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Quy tắc giao lại</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Mỗi đơn được giao lại tối đa {{ maxRedelivery }} lần.</li>
          <li>Quá lượt phải hoàn hàng về kho.</li>
          <li>Hoàn tất hoàn hàng cần nhập phí thực tế.</li>
          <li>Phí hoàn được đối chiếu với khoản thu COD.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Lý do phổ biến</p>
        <p class="cv-small cv-muted">Khách không có nhà · Không liên hệ được · Khách hẹn lại · Địa chỉ không chính xác.</p>
      </div>
    </aside>

    @if (active(); as order) {
      <app-detail-popup [open]="active() !== null" [title]="active() ? ('Giao thất bại ' + active()!.orderCode) : 'Giao thất bại'" (closed)="active.set(null)">

        <div popupBody class="cv-stack">
          <div class="cv-spread">
            <app-status-badge kind="order" [value]="order.status" />
            <span class="cv-small cv-muted">{{ order.customer.fullName }} · {{ order.customer.phoneNumber }}</span>
          </div>

          <dl class="cv-kv">
            <dt>Địa chỉ</dt>
            <dd>{{ order.shippingAddress.addressLine }}, {{ order.shippingAddress.ward }}, {{ order.shippingAddress.district }}, {{ order.shippingAddress.province }}</dd>
            <dt>Lý do lỗi</dt><dd>{{ order.shipment?.failureReason || 'Chưa ghi lý do' }}</dd>
            <dt>Số lần giao lại</dt><dd>{{ order.shipment?.redeliveryCount ?? 0 }}/{{ maxRedelivery }}</dd>
            <dt>Tổng đơn</dt><dd class="cv-num">{{ order.totals.totalAmount | vnd }}</dd>
          </dl>

          @if (order.status === 'DELIVERY_FAILED') {
            <div class="cv-field">
              <label class="cv-field__label" for="failure-note">Ghi chú xử lý</label>
              <textarea class="cv-textarea" id="failure-note" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ví dụ: khách hẹn giao lại chiều mai sau 17h"></textarea>
            </div>
          }

          @if (order.status === 'RETURNING') {
            <div class="cv-field">
              <label class="cv-field__label" for="actual-cost">Phí vận chuyển thực tế (VND)</label>
              <input class="cv-input" id="actual-cost" type="number" min="0" [value]="actualCost()" (input)="actualCost.set(+$any($event.target).value)" />
              <p class="cv-field__hint">Số tiền hoàn dự kiến: {{ refundPreview(order) | vnd }}</p>
            </div>
          }

          @if (activeError()) {
            <div class="cv-error" role="alert">{{ activeError() }}</div>
          }
        </div>
        <div popupFooter>
          @if (order.status === 'DELIVERY_FAILED') {
            <button type="button" class="cv-btn cv-btn--secondary" [disabled]="busy()" (click)="ask(order, 'RETURN')">Hoàn về kho</button>
            <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy() || (order.shipment?.redeliveryCount ?? 0) >= maxRedelivery" (click)="ask(order, 'REDELIVER')">
              Giao lại ({{ order.shipment?.redeliveryCount ?? 0 }}/{{ maxRedelivery }})
            </button>
          }
          @if (order.status === 'RETURNING') {
            <button type="button" class="cv-btn cv-btn--accent" [disabled]="busy()" (click)="ask(order, 'FINALIZE')">Hoàn tất hoàn hàng</button>
          }
        </div>
    </app-detail-popup>
      }

    <app-confirm-dialog
      [open]="pending() !== null"
      title="Xác nhận xử lý giao thất bại"
      [message]="confirmMessage()"
      confirmLabel="Xác nhận"
      [danger]="pending()?.kind === 'RETURN'"
      [loading]="busy()"
      (confirmed)="commit()"
      (cancelled)="pending.set(null)"
    />
  `,
  styles: [
    `
      .cell-address {
        white-space: normal;
        max-width: 220px;
        font-size: 12px;
        color: var(--cv-muted);
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
export class DeliveryFailedScreenComponent {
  private readonly api = inject(AdminOrderApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly maxRedelivery = MAX_REDELIVERY_COUNT;
  readonly keyword = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly orders = signal<OrderDetail[]>([]);

  readonly active = signal<OrderDetail | null>(null);
  readonly note = signal('');
  readonly actualCost = signal(0);
  readonly activeError = signal('');
  readonly busy = signal(false);
  readonly pending = signal<{ order: OrderDetail; kind: ActionKind } | null>(null);

  readonly rows = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    return this.orders().filter((order) => {
      if (order.status !== OrderStatus.DELIVERY_FAILED && order.status !== OrderStatus.RETURNING) {
        return false;
      }
      if (!keyword) return true;
      return (
        order.orderCode.toLowerCase().includes(keyword) ||
        order.customer.fullName.toLowerCase().includes(keyword) ||
        (order.shipment?.failureReason ?? '').toLowerCase().includes(keyword)
      );
    });
  });

  readonly returnedCount = computed(
    () => this.orders().filter((order) => order.status === OrderStatus.RETURNING).length,
  );
  readonly canRedeliver = computed(
    () =>
      this.orders().filter(
        (order) =>
          order.status === OrderStatus.DELIVERY_FAILED &&
          (order.shipment?.redeliveryCount ?? 0) < MAX_REDELIVERY_COUNT,
      ).length,
  );
  readonly overLimitCount = computed(
    () =>
      this.orders().filter(
        (order) =>
          order.status === OrderStatus.DELIVERY_FAILED &&
          (order.shipment?.redeliveryCount ?? 0) >= MAX_REDELIVERY_COUNT,
      ).length,
  );

  readonly confirmMessage = computed(() => {
    const target = this.pending();
    if (!target) return '';
    if (target.kind === 'REDELIVER') {
      return `Đơn ${target.order.orderCode} sẽ được giao lại lần ${(target.order.shipment?.redeliveryCount ?? 0) + 1}. Khách sẽ nhận thông báo lịch giao mới.`;
    }
    if (target.kind === 'RETURN') {
      return `Đơn ${target.order.orderCode} sẽ chuyển sang Đang hoàn hàng. Hàng sẽ được đưa về kho CaraVeso.`;
    }
    return `Hoàn tất hoàn hàng cho đơn ${target.order.orderCode} với phí thực tế ${this.actualCost().toLocaleString('vi-VN')}đ. Đơn sẽ đóng ở trạng thái Đã hủy.`;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({ status: 'ALL', page: 1, limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const ids = response.data
            .filter((item) => item.status === OrderStatus.DELIVERY_FAILED || item.status === OrderStatus.RETURNING)
            .map((item) => item.id);
          if (!ids.length) {
            this.orders.set([]);
            this.loading.set(false);
            return;
          }
          const loaded: OrderDetail[] = [];
          let remaining = ids.length;
          for (const id of ids) {
            this.api.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
              next: (detail) => {
                loaded.push(detail);
                remaining -= 1;
                if (remaining === 0) {
                  this.orders.set(loaded);
                  this.loading.set(false);
                }
              },
              error: () => {
                remaining -= 1;
                if (remaining === 0) {
                  this.orders.set(loaded);
                  this.loading.set(false);
                }
              },
            });
          }
        },
        error: () => {
          this.error.set('Không tải được danh sách đơn giao thất bại.');
          this.loading.set(false);
        },
      });
  }

  initials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'KH';
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  refundPreview(order: OrderDetail): number {
    const collected = order.payment.status === 'PAID' ? order.totals.totalAmount : 0;
    return Math.max(0, collected - this.actualCost());
  }

  open(order: OrderDetail): void {
    this.active.set(order);
    this.activeError.set('');
    this.note.set(
      order.shipment?.failureReason ? `Khách hẹn giao lại: ${order.shipment.failureReason}` : '',
    );
    this.actualCost.set(order.shipment?.actualShippingCost ?? 0);
  }

  ask(order: OrderDetail, kind: ActionKind): void {
    if (kind === 'REDELIVER' && (order.shipment?.redeliveryCount ?? 0) >= MAX_REDELIVERY_COUNT) {
      this.activeError.set('Đơn đã giao lại tối đa 2 lần, vui lòng hoàn hàng về kho.');
      return;
    }
    if (kind === 'FINALIZE' && this.actualCost() < 0) {
      this.activeError.set('Phí vận chuyển thực tế không hợp lệ.');
      return;
    }
    this.activeError.set('');
    this.pending.set({ order, kind });
  }

  commit(): void {
    const target = this.pending();
    if (!target) return;
    this.busy.set(true);

    const request$ =
      target.kind === 'FINALIZE'
        ? this.api.finalizeReturn(target.order.id, {
            actualShippingCost: this.actualCost(),
            note: this.note().trim() || undefined,
          })
        : this.api.updateStatus(target.order.id, {
            status: target.kind === 'REDELIVER' ? OrderStatus.SHIPPING : OrderStatus.RETURNING,
            note: this.note().trim() || undefined,
          });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pending.set(null);
        this.orders.update((list) => list.map((order) => (order.id === updated.id ? updated : order)));
        this.active.set(updated);
        this.notifications.show(`Đã cập nhật đơn ${updated.orderCode}.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const message = error instanceof Error ? error.message : 'Không xử lý được đơn.';
        this.activeError.set(message);
        this.notifications.show(message, 'error');
      },
    });
  }
}
