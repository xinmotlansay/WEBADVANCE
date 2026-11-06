import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CANCEL_REASONS,
  ORDER_STATUS_LABEL,
  AdminOrderStatus as OrderStatus,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  REFUND_DESTINATION_LABEL,
  REFUND_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  type AdminOrderDetail as OrderDetail,
  type OrderListItem,
  type OrderListQuery,
} from 'shared';
import { AdminOrderApi } from '../../core/api/admin-order.api';
import { loadAllPages } from '../../core/api/load-all-pages';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, OrderCodePipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { NotificationService } from '../../core/ui/notification.service';
import { BulkBarComponent } from '../../shared/ui/bulk-bar/bulk-bar.component';
import { ConfirmDialogComponent } from '../../shared/ui/dialogs/confirm-dialog.component';
import { ReasonDialogComponent } from '../../shared/ui/dialogs/reason-dialog.component';
import {
  FilterChipComponent,
  type FilterOption,
} from '../../shared/ui/filters/filter-chip.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { PaginationComponent } from '../../shared/ui/pagination/pagination.component';
import { DetailPopupComponent } from '../../shared/ui/popup/detail-popup.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  TableSkeletonComponent,
} from '../../shared/ui/states/state-components';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  ...Object.values(OrderStatus).map((status) => ({
    value: status,
    label: ORDER_STATUS_LABEL[status],
  })),
];

const PAYMENT_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả thanh toán' },
  ...Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const DATE_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Mọi lúc' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
];

type DetailTab = 'items' | 'payment' | 'shipping' | 'history';

@Component({
  selector: 'app-orders-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PageHeaderComponent,
    IconComponent,
    FilterChipComponent,
    StatusBadgeComponent,
    PaginationComponent,
    DetailPopupComponent,
    ConfirmDialogComponent,
    ReasonDialogComponent,
    BulkBarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    VndPipe,
    ShortVndPipe,
    DateVnPipe,
    OrderCodePipe,
    RouterLink,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Đơn hàng"
        subtitle="Xác nhận, theo dõi và xử lý toàn bộ vòng đời đơn hàng."
        searchId="orders-search"
        searchPlaceholder="Mã đơn, tên hoặc SĐT khách…"
        [searchValue]="keyword()"
        (searchChange)="onSearch($event)"
        [hasNotifications]="overdueCount() > 0"
      >
        <button
          type="button"
          class="cv-btn cv-btn--secondary"
          (click)="exportCsv()"
          [disabled]="loading() || exporting()"
        >
          <app-icon name="download" size="sm" />
          {{ exporting() ? 'Đang xuất…' : 'Xuất CSV' }}
        </button>
        <button
          type="button"
          class="cv-btn cv-btn--primary"
          (click)="load()"
          [disabled]="loading()"
        >
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
      </app-page-header>

      <div class="cv-filter-row">
        <app-filter-chip
          label="Trạng thái"
          [options]="statusOptions"
          [value]="status()"
          (valueChange)="status.set($event); page.set(1); load()"
        />
        <app-filter-chip
          label="Thanh toán"
          [options]="paymentOptions"
          [value]="paymentStatus()"
          (valueChange)="paymentStatus.set($event); page.set(1); load()"
        />
        <app-filter-chip
          label="Thời gian"
          [options]="dateOptions"
          [value]="dateRange()"
          (valueChange)="dateRange.set($event); page.set(1); load()"
        />
        @if (hasFilters()) {
          <button type="button" class="cv-chip" (click)="resetFilters()">
            <app-icon name="x" size="sm" />
            Xóa bộ lọc
          </button>
        }
      </div>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5, 6, 7, 8]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (orders().length === 0) {
        <app-empty-state
          icon="shopping-bag"
          title="Không có đơn phù hợp"
          message="Thử xóa bộ lọc hoặc tìm bằng mã đơn khác."
          [actionLabel]="hasFilters() ? 'Xóa bộ lọc' : ''"
          (action)="resetFilters()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">
                Danh sách đơn hàng
              </caption>
              <thead>
                <tr>
                  <th scope="col" style="width: 32px">
                    <input
                      type="checkbox"
                      class="cv-table__checkbox"
                      aria-label="Chọn tất cả đơn trên trang"
                      [checked]="allSelected()"
                      (change)="toggleAll($any($event.target).checked)"
                    />
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      class="cv-table__sort"
                      [class.cv-table__sort--active]="sort() === 'createdAt'"
                      (click)="sortBy('createdAt')"
                    >
                      Mã đơn
                      <app-icon name="chevron-down" size="sm" />
                    </button>
                  </th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">SĐT</th>
                  <th scope="col" class="cv-table__cell--num">
                    <button
                      type="button"
                      class="cv-table__sort"
                      [class.cv-table__sort--active]="sort() === 'totalAmount'"
                      (click)="sortBy('totalAmount')"
                    >
                      Tổng tiền
                      <app-icon name="chevron-down" size="sm" />
                    </button>
                  </th>
                  <th scope="col">Thanh toán</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày đặt</th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr
                    class="cv-table__row--clickable"
                    [class.cv-table__row--selected]="selected().has(order.id)"
                    (click)="openDetail(order)"
                  >
                    <td (click)="$event.stopPropagation()">
                      <input
                        type="checkbox"
                        class="cv-table__checkbox"
                        [attr.aria-label]="'Chọn đơn ' + order.orderCode"
                        [checked]="selected().has(order.id)"
                        (change)="toggleOne(order.id, $any($event.target).checked)"
                      />
                    </td>
                    <td>
                      <button type="button" class="cv-table__link">
                        {{ order.orderCode | orderCode }}
                      </button>
                      @if (order.isOverdue) {
                        <span class="cv-badge cv-badge--danger" style="margin-left: 6px"
                          >Quá hạn</span
                        >
                      }
                    </td>
                    <td>
                      <span class="cv-table__customer">
                        <span class="cv-avatar" aria-hidden="true">{{
                          initials(order.customerName)
                        }}</span>
                        {{ order.customerName }}
                      </span>
                    </td>
                    <td class="cv-num">{{ order.customerPhone }}</td>
                    <td class="cv-table__cell--num">{{ order.totalAmount | vnd }}</td>
                    <td><app-status-badge kind="payment" [value]="order.paymentStatus" /></td>
                    <td><app-status-badge kind="order" [value]="order.status" /></td>
                    <td class="cv-nowrap">{{ order.createdAt | dateVn }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination [meta]="meta()" (pageChange)="page.set($event); load()" />
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan đơn hàng">
      <div class="cv-rail__hero">
        <p class="cv-label">Giá trị trang này</p>
        <p class="cv-hero-num">{{ pageValue() | shortVnd }}</p>
        <p class="cv-small cv-muted">
          {{ orders().length }} đơn · {{ meta().total }} đơn toàn hệ thống
        </p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Đếm theo trạng thái</p>
        <ul class="count-list">
          @for (item of statusCounts(); track item.status) {
            <li class="count-item">
              <app-status-badge kind="order" [value]="item.status" />
              <span class="cv-num cv-small">{{ item.count }}</span>
            </li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Quy tắc xử lý</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Đơn chờ xác nhận quá 20 giờ được đánh dấu quá hạn.</li>
          <li>Chỉ chuyển trạng thái theo đúng bước hợp lệ của đơn.</li>
          <li>Đơn đã bàn giao không hủy trực tiếp, phải hoàn hàng.</li>
          <li>Hủy đơn bắt buộc chọn lý do và ghi chú nếu hoàn tiền.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Đơn quá hạn</p>
        <p class="cv-sub-num">{{ overdueCount() }}</p>
        <p class="cv-small cv-muted">Cần xác nhận hoặc hủy để khách không chờ lâu.</p>
      </div>
    </aside>

    @if (selectionCount() > 0) {
      <app-bulk-bar [count]="selectionCount()" (cleared)="clearSelection()">
        <button type="button" class="cv-btn cv-btn--sm cv-btn--ghost" (click)="bulkConfirm()">
          <app-icon name="check" size="sm" />
          Xác nhận đơn
        </button>
        <button type="button" class="cv-btn cv-btn--sm cv-btn--ghost" (click)="bulkPrint()">
          <app-icon name="printer" size="sm" />
          In phiếu
        </button>
        <button
          type="button"
          class="cv-btn cv-btn--sm cv-btn--accent"
          (click)="bulkExport()"
          [disabled]="exporting()"
        >
          <app-icon name="download" size="sm" />
          {{ exporting() ? 'Đang xuất…' : 'Xuất dữ liệu' }}
        </button>
      </app-bulk-bar>
    }

    @if (detail(); as order) {
      <app-detail-popup
        [open]="detailOpen()"
        [title]="'Đơn ' + (order.orderCode | orderCode)"
        (closed)="closeDetail()"
      >
        <div popupBody class="detail">
          <div class="detail__top">
            <app-status-badge kind="order" [value]="order.status" />
            <app-status-badge kind="payment" [value]="order.payment.status" />
            <span class="cv-small cv-muted">{{ order.createdAt | dateVn: 'datetime' }}</span>
          </div>

          <section class="cv-popup__section">
            <dl class="cv-kv">
              <dt>Khách hàng</dt>
              <dd>{{ order.customer.fullName }}</dd>
              <dt>Điện thoại</dt>
              <dd>{{ order.customer.phoneNumber }}</dd>
              <dt>Email</dt>
              <dd>{{ order.customer.email || '—' }}</dd>
              <dt>Địa chỉ</dt>
              <dd>
                {{ order.shippingAddress.addressLine }}, {{ order.shippingAddress.ward }},
                {{ order.shippingAddress.district }}, {{ order.shippingAddress.province }}
              </dd>
              <dt>Ghi chú</dt>
              <dd>{{ order.note || 'Không có' }}</dd>
            </dl>
          </section>

          <div class="cv-tabs" role="tablist">
            <button
              type="button"
              class="cv-tab"
              role="tab"
              [class.cv-tab--active]="tab() === 'items'"
              [attr.aria-selected]="tab() === 'items'"
              (click)="tab.set('items')"
            >
              Sản phẩm
            </button>
            <button
              type="button"
              class="cv-tab"
              role="tab"
              [class.cv-tab--active]="tab() === 'payment'"
              [attr.aria-selected]="tab() === 'payment'"
              (click)="tab.set('payment')"
            >
              Thanh toán
            </button>
            <button
              type="button"
              class="cv-tab"
              role="tab"
              [class.cv-tab--active]="tab() === 'shipping'"
              [attr.aria-selected]="tab() === 'shipping'"
              (click)="tab.set('shipping')"
            >
              Vận chuyển
            </button>
            <button
              type="button"
              class="cv-tab"
              role="tab"
              [class.cv-tab--active]="tab() === 'history'"
              [attr.aria-selected]="tab() === 'history'"
              (click)="tab.set('history')"
            >
              Lịch sử
            </button>
          </div>

          @switch (tab()) {
            @case ('items') {
              <div class="cv-stack" style="gap: 12px">
                @for (item of order.items; track item.id) {
                  <div class="item">
                    <div class="item__thumb" aria-hidden="true"><app-icon name="box" /></div>
                    <div style="min-width: 0; flex: 1">
                      <p class="item__name">{{ item.name }}</p>
                      <p class="cv-small cv-muted">
                        SKU {{ item.sku }} · {{ item.color }} · {{ item.dimensions }}
                      </p>
                      <p class="cv-small cv-muted">
                        {{ item.quantity }} × {{ item.unitPrice | vnd }}
                        @if (item.hasInstallation) {
                          · lắp đặt {{ item.installationFee | vnd }}
                        }
                        · bảo hành {{ item.warrantyMonths }} tháng
                      </p>
                    </div>
                    <span class="cv-num cv-small">{{ item.finalAmount | vnd }}</span>
                  </div>
                }
                <dl class="cv-kv totals">
                  <dt>Tạm tính</dt>
                  <dd class="cv-right">{{ order.totals.subtotal | vnd }}</dd>
                  <dt>Khuyến mãi</dt>
                  <dd class="cv-right">-{{ order.totals.promotionDiscount | vnd }}</dd>
                  <dt>Voucher</dt>
                  <dd class="cv-right">-{{ order.totals.voucherDiscount | vnd }}</dd>
                  <dt>Phí vận chuyển</dt>
                  <dd class="cv-right">{{ order.totals.shippingFee | vnd }}</dd>
                  <dt>Lắp đặt</dt>
                  <dd class="cv-right">{{ order.totals.installationFee | vnd }}</dd>
                  @if (order.totals.exchangeCredit) {
                    <dt>Trừ giá trị hàng đổi</dt>
                    <dd class="cv-right">-{{ order.totals.exchangeCredit | vnd }}</dd>
                  }
                </dl>
                <div class="cv-popup__total">
                  <span>Tổng cộng</span>
                  <span class="cv-num">{{ order.totals.totalAmount | vnd }}</span>
                </div>
              </div>
            }
            @case ('payment') {
              <dl class="cv-kv">
                <dt>Phương thức</dt>
                <dd>{{ paymentMethodLabel(order) }}</dd>
                <dt>Hình thức</dt>
                <dd>
                  {{
                    order.payment.collectionType === 'DEPOSIT' ? 'Đặt cọc' : 'Thanh toán toàn bộ'
                  }}
                </dd>
                <dt>Trạng thái</dt>
                <dd><app-status-badge kind="payment" [value]="order.payment.status" /></dd>
                <dt>Số tiền cọc</dt>
                <dd>{{ order.payment.depositAmount | vnd }}</dd>
                <dt>Thu khi giao</dt>
                <dd>{{ order.payment.codAmount | vnd }}</dd>
                <dt>Hạn thanh toán</dt>
                <dd>
                  {{ order.payment.dueAt ? (order.payment.dueAt | dateVn: 'datetime') : '—' }}
                </dd>
                <dt>Nội dung CK</dt>
                <dd>{{ order.payment.transferContent || '—' }}</dd>
                <dt>Mã giao dịch</dt>
                <dd>{{ order.payment.lastTransactionCode || '—' }}</dd>
              </dl>
              @if (order.payment.refund; as refund) {
                <section class="cv-popup__section" style="margin-top: 12px">
                  <p class="cv-label" style="margin-bottom: 8px">Hoàn tiền cho khách</p>
                  <dl class="cv-kv">
                    <dt>Trạng thái</dt>
                    <dd>
                      <span class="cv-badge" [class]="'cv-badge cv-badge--' + refundTone(refund.status)">
                        {{ refundStatusLabel(refund.status) }}
                      </span>
                    </dd>
                    <dt>Số tiền</dt>
                    <dd class="cv-num">{{ refund.amount | vnd }}</dd>
                    @if (refund.source) {
                      <dt>Lý do hoàn</dt>
                      <dd>{{ refundSourceLabel(refund.source) }}</dd>
                    }
                    <dt>Hoàn về</dt>
                    <dd>{{ refund.refundTo ? refundDestinationLabel(refund.refundTo) : '—' }}</dd>
                    @if (refund.refundAccount; as account) {
                      <dt>Tài khoản nhận</dt>
                      <dd>{{ account.bankName }} · {{ account.accountNumber }} · {{ account.accountHolder }}</dd>
                    } @else if (refund.originalTransactionCode) {
                      <dt>Giao dịch gốc</dt>
                      <dd class="cv-num">{{ refund.originalTransactionCode }}</dd>
                    }
                    <dt>Yêu cầu lúc</dt>
                    <dd>{{ refund.requestedAt | dateVn: 'datetime' }}</dd>
                    @if (refund.completedAt) {
                      <dt>Hoàn xong lúc</dt>
                      <dd>{{ refund.completedAt | dateVn: 'datetime' }}</dd>
                    }
                    @if (refund.proofImage) {
                      <dt>Chứng từ</dt>
                      <dd><a [href]="refund.proofImage" target="_blank" rel="noopener">Xem chứng từ</a></dd>
                    }
                  </dl>
                  @if (refund.status !== 'COMPLETED') {
                    <a class="cv-btn cv-btn--secondary" style="margin-top: 10px" routerLink="/admin/payments">
                      Xử lý ở Thanh toán & đối soát
                    </a>
                  }
                </section>
              } @else if (order.status === 'CANCELLED' && ['PAID', 'DEPOSITED'].includes(order.payment.status)) {
                <div class="cv-alert-box" style="margin-top: 12px">
                  Đơn đã hủy nhưng không có khoản hoàn tiền nào (không hoàn cho khách khi hủy).
                </div>
              }
            }
            @case ('shipping') {
              @if (order.shipment; as shipment) {
                <dl class="cv-kv">
                  <dt>Đơn vị</dt>
                  <dd>{{ shipment.carrier || 'Chưa gán' }}</dd>
                  <dt>Mã vận đơn</dt>
                  <dd>{{ shipment.trackingCode || '—' }}</dd>
                  <dt>Đội xe</dt>
                  <dd>{{ shipment.assignedTeam || '—' }}</dd>
                  <dt>Trạng thái</dt>
                  <dd><app-status-badge kind="shipment" [value]="shipment.status" /></dd>
                  <dt>Dự kiến giao</dt>
                  <dd>
                    {{
                      shipment.estimatedDeliveryDate
                        ? (shipment.estimatedDeliveryDate | dateVn)
                        : '—'
                    }}
                  </dd>
                  <dt>Lịch hẹn</dt>
                  <dd>
                    {{
                      shipment.scheduledDate ? (shipment.scheduledDate | dateVn: 'datetime') : '—'
                    }}
                  </dd>
                  <dt>Giao lại</dt>
                  <dd>{{ shipment.redeliveryCount }}/2 lần</dd>
                  <dt>Lý do lỗi</dt>
                  <dd>{{ shipment.failureReason || '—' }}</dd>
                  <dt>Phí thực tế</dt>
                  <dd>{{ shipment.actualShippingCost | vnd }}</dd>
                  <dt>Lắp đặt</dt>
                  <dd>
                    {{
                      shipment.installationSchedule
                        ? (shipment.installationSchedule | dateVn: 'datetime')
                        : '—'
                    }}
                  </dd>
                </dl>
              } @else {
                <p class="cv-small cv-muted">Đơn chưa bàn giao cho vận chuyển.</p>
              }
            }
            @case ('history') {
              <ol class="timeline">
                @for (entry of order.statusHistory; track entry.at) {
                  <li class="timeline__item">
                    <span class="timeline__dot" aria-hidden="true"></span>
                    <div>
                      <p class="cv-small" style="font-weight: 600">
                        {{ statusLabel(entry.toStatus) }}
                      </p>
                      <p class="cv-small cv-muted">
                        {{ entry.at | dateVn: 'datetime' }} · {{ entry.changedBy || 'Hệ thống' }}
                      </p>
                      @if (entry.note) {
                        <p class="cv-small">{{ entry.note }}</p>
                      }
                    </div>
                  </li>
                }
              </ol>
            }
          }
        </div>

        <div popupFooter>
          @if (order.status === 'PENDING_CONFIRMATION') {
            <button
              type="button"
              class="cv-btn cv-btn--accent"
              [disabled]="acting()"
              (click)="confirmOrder(order)"
            >
              <app-icon name="check" size="sm" />
              Xác nhận đơn
            </button>
          }
          @if (nextStatuses(order).length) {
            <button
              type="button"
              class="cv-btn cv-btn--primary"
              [disabled]="acting()"
              (click)="openNextStatus(order)"
            >
              <app-icon name="arrow-right" size="sm" />
              Chuyển trạng thái
            </button>
          }
          @if (canCancel(order)) {
            <button
              type="button"
              class="cv-btn cv-btn--danger"
              [disabled]="acting()"
              (click)="openCancel(order)"
            >
              Hủy đơn
            </button>
          }
        </div>
      </app-detail-popup>
    } @else if (detailLoading()) {
      <app-detail-popup [open]="detailOpen()" title="Chi tiết đơn" (closed)="closeDetail()">
        <div popupBody><app-table-skeleton [rows]="[1, 2, 3, 4]" /></div>
      </app-detail-popup>
    }

    <app-confirm-dialog
      [open]="nextStatusTarget() !== null"
      title="Chuyển trạng thái đơn"
      [message]="nextStatusMessage()"
      confirmLabel="Xác nhận chuyển"
      [loading]="acting()"
      (confirmed)="applyNextStatus()"
      (cancelled)="nextStatusTarget.set(null)"
    >
      @if (nextStatusTarget(); as target) {
        <div class="cv-field" style="margin-top: 12px">
          <label class="cv-field__label" for="next-status">Trạng thái tiếp theo</label>
          <select
            class="cv-select"
            id="next-status"
            [value]="chosenStatus()"
            (change)="chosenStatus.set($any($event.target).value)"
          >
            @for (status of nextStatuses(target); track status) {
              <option [value]="status">{{ statusLabel(status) }}</option>
            }
          </select>
        </div>
        <div class="cv-field" style="margin-top: 12px">
          <label class="cv-field__label" for="next-note">Ghi chú (không bắt buộc)</label>
          <textarea
            class="cv-textarea"
            id="next-note"
            [value]="actionNote()"
            (input)="actionNote.set($any($event.target).value)"
            placeholder="Thông tin thêm cho khách hoặc bộ phận vận chuyển"
          ></textarea>
        </div>
      }
    </app-confirm-dialog>

    <app-reason-dialog
      [open]="cancelTarget() !== null"
      title="Hủy đơn hàng"
      confirmLabel="Hủy đơn"
      [options]="cancelReasons"
      noteLabel="Ghi chú cho khách"
      [noteRequired]="hasPaid(cancelTarget())"
      [warning]="
        hasPaid(cancelTarget())
          ? 'Đơn đã thanh toán: hệ thống sẽ ghi nhận yêu cầu hoàn tiền cho khách.'
          : ''
      "
      [loading]="acting()"
      (submitted)="applyCancel($event.reason, $event.note)"
      (cancelled)="cancelTarget.set(null)"
    />

    <app-confirm-dialog
      [open]="bulkConfirmOpen()"
      title="Xác nhận nhiều đơn"
      [message]="
        'Xác nhận ' +
        selectionCount() +
        ' đơn đang chờ? Các đơn không ở trạng thái chờ xác nhận sẽ bị bỏ qua.'
      "
      confirmLabel="Xác nhận đơn"
      [loading]="bulkBusy()"
      (confirmed)="runBulkConfirm()"
      (cancelled)="bulkConfirmOpen.set(false)"
    />
  `,
  styles: [
    `
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

      .detail__top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
      }

      .item {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--cv-border);
      }

      .item:last-of-type {
        border-bottom: 0;
        padding-bottom: 0;
      }

      .item__thumb {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        display: grid;
        place-items: center;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
        color: var(--cv-muted);
      }

      .item__name {
        font-size: var(--cv-text-small);
        font-weight: 600;
      }

      .totals {
        grid-template-columns: 1fr auto;
      }

      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .timeline__item {
        display: flex;
        gap: 10px;
        position: relative;
        padding-left: 2px;
      }

      .timeline__dot {
        width: 8px;
        height: 8px;
        margin-top: 6px;
        flex: 0 0 8px;
        border-radius: 2px;
        background: var(--cv-navy);
      }
    `,
  ],
})
export class OrdersScreenComponent {
  private readonly api = inject(AdminOrderApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AdminAuthService);

  readonly statusOptions = STATUS_OPTIONS;
  readonly paymentOptions = PAYMENT_OPTIONS;
  readonly dateOptions = DATE_OPTIONS;
  readonly cancelReasons = CANCEL_REASONS;

  readonly keyword = signal('');
  readonly status = signal<string>('ALL');
  readonly paymentStatus = signal<string>('ALL');
  readonly dateRange = signal<string>('ALL');
  readonly page = signal(1);
  readonly sort = signal<'createdAt' | 'totalAmount'>('createdAt');
  readonly direction = signal<'asc' | 'desc'>('desc');

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly orders = signal<OrderListItem[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  readonly selected = signal<Set<string>>(new Set());
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detail = signal<OrderDetail | null>(null);
  readonly tab = signal<DetailTab>('items');
  readonly acting = signal(false);

  readonly nextStatusTarget = signal<OrderDetail | null>(null);
  readonly chosenStatus = signal<OrderStatus | ''>('');
  readonly actionNote = signal('');
  readonly cancelTarget = signal<OrderDetail | null>(null);
  readonly bulkConfirmOpen = signal(false);
  readonly bulkBusy = signal(false);

  readonly hasFilters = computed(
    () =>
      this.status() !== 'ALL' ||
      this.paymentStatus() !== 'ALL' ||
      this.dateRange() !== 'ALL' ||
      this.keyword() !== '',
  );
  readonly allSelected = computed(() => {
    const page = this.orders();
    return page.length > 0 && page.every((order) => this.selected().has(order.id));
  });
  readonly pageValue = computed(() =>
    this.orders().reduce((sum, order) => sum + order.totalAmount, 0),
  );
  readonly overdueCount = computed(() => this.orders().filter((order) => order.isOverdue).length);
  readonly statusCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const order of this.orders()) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  });

  readonly selectionCount = computed(() => this.selected().size);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list(this.buildQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.orders.set(response.data);
          this.meta.set(response.meta);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được danh sách đơn hàng. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });
  }

  onSearch(value: string): void {
    this.keyword.set(value);
    this.page.set(1);
    this.load();
  }

  sortBy(field: 'createdAt' | 'totalAmount'): void {
    if (this.sort() === field) {
      this.direction.set(this.direction() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.direction.set('desc');
    }
    this.load();
  }

  resetFilters(): void {
    this.keyword.set('');
    this.status.set('ALL');
    this.paymentStatus.set('ALL');
    this.dateRange.set('ALL');
    this.page.set(1);
    this.load();
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  statusLabel(status: string): string {
    return ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
  }

  refundStatusLabel(status: string): string {
    return REFUND_STATUS_LABEL[status as keyof typeof REFUND_STATUS_LABEL] ?? status;
  }

  refundTone(status: string): string {
    return status === 'COMPLETED' ? 'success' : status === 'PROCESSING' ? 'info' : 'warning';
  }

  refundSourceLabel(source: string): string {
    return REFUND_SOURCE_LABEL[source as keyof typeof REFUND_SOURCE_LABEL] ?? source;
  }

  refundDestinationLabel(destination: string): string {
    return REFUND_DESTINATION_LABEL[destination as keyof typeof REFUND_DESTINATION_LABEL] ?? destination;
  }

  paymentMethodLabel(order: OrderDetail): string {
    return PAYMENT_METHOD_LABEL[order.payment.method] ?? order.payment.method;
  }

  toggleOne(id: string, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      for (const order of this.orders()) {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  openDetail(order: OrderListItem): void {
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.tab.set('items');
    this.detail.set(null);
    this.api
      .get(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailLoading.set(false);
          this.notifications.show('Không tải được chi tiết đơn.', 'error');
        },
      });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detail.set(null);
    this.nextStatusTarget.set(null);
    this.cancelTarget.set(null);
  }

  nextStatuses(order: OrderDetail): OrderStatus[] {
    return order.allowedNext ?? [];
  }

  canCancel(order: OrderDetail): boolean {
    return ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED'].includes(order.status);
  }

  hasPaid(order: OrderDetail | null): boolean {
    if (!order) return false;
    return ['PAID', 'DEPOSITED'].includes(order.payment.status);
  }

  confirmOrder(order: OrderDetail): void {
    this.acting.set(true);
    this.api
      .confirm(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.detail.set(updated);
          this.replaceRow(updated);
          this.notifications.show(`Đã xác nhận đơn ${updated.orderCode}.`);
        },
        error: () => {
          this.acting.set(false);
          this.notifications.show('Không xác nhận được đơn, vui lòng thử lại.', 'error');
        },
      });
  }

  openNextStatus(order: OrderDetail): void {
    this.nextStatusTarget.set(order);
    this.chosenStatus.set(order.allowedNext[0] ?? '');
    this.actionNote.set('');
  }

  nextStatusMessage(): string {
    const order = this.nextStatusTarget();
    if (!order) return '';
    return `Đơn ${order.orderCode} sẽ chuyển sang trạng thái mới và ghi vào lịch sử. Hành động này không thể hoàn tác.`;
  }

  applyNextStatus(): void {
    const order = this.nextStatusTarget();
    const status = this.chosenStatus();
    if (!order || !status) return;
    this.acting.set(true);
    this.api
      .updateStatus(order.id, {
        status: status as OrderStatus,
        note: this.actionNote() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.nextStatusTarget.set(null);
          this.detail.set(updated);
          this.replaceRow(updated);
          this.notifications.show(
            `Đã chuyển đơn ${updated.orderCode} sang ${this.statusLabel(updated.status)}.`,
          );
        },
        error: () => {
          this.acting.set(false);
          this.notifications.show('Không chuyển được trạng thái, vui lòng thử lại.', 'error');
        },
      });
  }

  openCancel(order: OrderDetail): void {
    this.cancelTarget.set(order);
  }

  applyCancel(reason: string, note: string): void {
    const order = this.cancelTarget();
    if (!order) return;
    this.acting.set(true);
    this.api
      .cancel(order.id, { reason, note: note || undefined, refundToCustomer: this.hasPaid(order) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.acting.set(false);
          this.cancelTarget.set(null);
          this.detail.set(updated);
          this.replaceRow(updated);
          this.notifications.show(`Đã hủy đơn ${updated.orderCode}.`);
        },
        error: () => {
          this.acting.set(false);
          this.notifications.show('Không hủy được đơn, vui lòng thử lại.', 'error');
        },
      });
  }

  bulkConfirm(): void {
    this.bulkConfirmOpen.set(true);
  }

  runBulkConfirm(): void {
    const ids = Array.from(this.selected());
    if (!ids.length) return;
    this.bulkBusy.set(true);
    const targets = this.orders().filter(
      (order) => ids.includes(order.id) && order.status === 'PENDING_CONFIRMATION',
    );
    if (!targets.length) {
      this.bulkBusy.set(false);
      this.bulkConfirmOpen.set(false);
      this.notifications.show('Không có đơn nào đang chờ xác nhận trong lựa chọn.', 'error');
      return;
    }
    let done = 0;
    for (const order of targets) {
      this.api
        .confirm(order.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            done += 1;
            if (done === targets.length) this.finishBulk(done);
          },
          error: () => {
            done += 1;
            if (done === targets.length) this.finishBulk(done);
          },
        });
    }
  }

  private finishBulk(count: number): void {
    this.bulkBusy.set(false);
    this.bulkConfirmOpen.set(false);
    this.clearSelection();
    this.notifications.show(`Đã xử lý xác nhận ${count} đơn.`);
    this.load();
  }

  bulkPrint(): void {
    this.notifications.show(`Đã gửi lệnh in ${this.selected().size} phiếu giao hàng.`);
  }

  bulkExport(): void {
    const ids = [...this.selected()];
    if (ids.length === 0 || this.exporting()) return;

    this.exporting.set(true);
    forkJoin(ids.map((id) => this.api.get(id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `don-hang-da-chon-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Mã đơn', value: (order) => order.orderCode },
              { label: 'Khách hàng', value: (order) => order.customer.fullName },
              { label: 'Số điện thoại', value: (order) => order.customer.phoneNumber },
              { label: 'Địa chỉ', value: (order) => this.addressOf(order) },
              { label: 'Trạng thái', value: (order) => this.statusLabel(order.status) },
              {
                label: 'Trạng thái thanh toán',
                value: (order) => PAYMENT_STATUS_LABEL[order.payment.status],
              },
              { label: 'Tổng tiền', value: (order) => order.totals.totalAmount },
              { label: 'Ngày tạo', value: (order) => order.createdAt },
            ],
            orders,
          );
          this.notifications.show(
            downloaded ? `Đã tải xuống ${orders.length} đơn đã chọn.` : 'Không có đơn để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được dữ liệu đơn đã chọn để xuất file.', 'error');
        },
      });
  }

  exportCsv(): void {
    if (this.exporting()) return;

    const query = this.buildQuery();
    this.exporting.set(true);
    loadAllPages((page, limit) => this.api.list({ ...query, page, limit }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `don-hang-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Mã đơn', value: (order) => order.orderCode },
              { label: 'Khách hàng', value: (order) => order.customerName },
              { label: 'Số điện thoại', value: (order) => order.customerPhone },
              { label: 'Số sản phẩm', value: (order) => order.itemCount },
              { label: 'Tổng tiền', value: (order) => order.totalAmount },
              { label: 'Trạng thái', value: (order) => this.statusLabel(order.status) },
              {
                label: 'Thanh toán',
                value: (order) => PAYMENT_STATUS_LABEL[order.paymentStatus],
              },
              {
                label: 'Phương thức thanh toán',
                value: (order) => PAYMENT_METHOD_LABEL[order.paymentMethod],
              },
              { label: 'Ngày tạo', value: (order) => order.createdAt },
              { label: 'Quá hạn xác nhận', value: (order) => (order.isOverdue ? 'Có' : 'Không') },
            ],
            orders,
          );
          this.notifications.show(
            downloaded
              ? `Đã tải xuống ${orders.length} đơn theo bộ lọc.`
              : 'Không có đơn phù hợp để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được danh sách đơn để xuất file.', 'error');
        },
      });
  }

  private addressOf(order: OrderDetail): string {
    const address = order.shippingAddress;
    return [address.addressLine, address.ward, address.district, address.province]
      .filter(Boolean)
      .join(', ');
  }

  private replaceRow(updated: OrderDetail): void {
    this.orders.update((rows) =>
      rows.map((row) =>
        row.id === updated.id
          ? {
              ...row,
              status: updated.status,
              paymentStatus: updated.payment.status,
              totalAmount: updated.totals.totalAmount,
            }
          : row,
      ),
    );
  }

  private buildQuery(): OrderListQuery {
    const query: OrderListQuery = {
      q: this.keyword() || undefined,
      status: this.status() as OrderStatus | 'ALL',
      paymentStatus: this.paymentStatus() as OrderListQuery['paymentStatus'],
      page: this.page(),
      limit: this.meta().limit,
      sort: this.sort(),
      direction: this.direction(),
    };

    const range = this.dateRange();
    const now = new Date();
    if (range === 'today') {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      query.from = from.toISOString().slice(0, 10);
    } else if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      const from = new Date(now.getTime() - days * 86_400_000);
      query.from = from.toISOString().slice(0, 10);
    }
    return query;
  }
}
