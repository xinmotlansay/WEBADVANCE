import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap } from 'rxjs';
import {
  INSPECTION_RESULT_LABEL,
  InspectionResult,
  RETURN_COST_BEARER_LABEL,
  RETURN_STATUS_LABEL,
  RETURN_TYPE_LABEL,
  ReturnCostBearer,
  ReturnStatus,
  ReturnType,
  type ReturnRequest,
} from 'shared';
import { AdminReturnApi } from '../../core/api/admin-return.api';
import { loadAllPages } from '../../core/api/load-all-pages';
import { parseApiError } from '../../core/auth/auth-error';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, OrderCodePipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
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
  ...Object.entries(RETURN_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const TYPE_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả loại' },
  ...Object.entries(RETURN_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

const INSPECTION_OPTIONS = Object.entries(INSPECTION_RESULT_LABEL).map(([value, label]) => ({
  value,
  label,
}));
const COST_OPTIONS = Object.entries(RETURN_COST_BEARER_LABEL).map(([value, label]) => ({
  value,
  label,
}));

@Component({
  selector: 'app-returns-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    FilterChipComponent,
    StatusBadgeComponent,
    PaginationComponent,
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
        title="Đổi trả"
        subtitle="Xử lý yêu cầu đổi hàng và trả hàng hoàn tiền trong 7 ngày."
        searchId="returns-search"
        searchPlaceholder="Mã phiếu, mã đơn, khách…"
        [searchValue]="keyword()"
        (searchChange)="onSearch($event)"
        [hasNotifications]="pendingCount() > 0"
      >
        <button
          type="button"
          class="cv-btn cv-btn--secondary"
          (click)="load()"
          [disabled]="loading()"
        >
          <app-icon name="refresh-cw" size="sm" />
          Tải lại
        </button>
        <button
          type="button"
          class="cv-btn cv-btn--primary"
          (click)="exportCsv()"
          [disabled]="loading() || exporting()"
        >
          <app-icon name="download" size="sm" />
          {{ exporting() ? 'Đang xuất…' : 'Xuất danh sách' }}
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
          label="Loại"
          [options]="typeOptions"
          [value]="type()"
          (valueChange)="type.set($event); page.set(1); load()"
        />
        @if (keyword() || status() !== 'ALL' || type() !== 'ALL') {
          <button type="button" class="cv-chip" (click)="resetFilters()">
            <app-icon name="x" size="sm" />
            Xóa bộ lọc
          </button>
        }
      </div>

      @if (loading()) {
        <app-table-skeleton [rows]="[1, 2, 3, 4, 5]" />
      } @else if (error()) {
        <app-error-state [message]="error()" (retry)="load()" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="rotate-ccw"
          title="Không có yêu cầu đổi trả"
          message="Thử đổi bộ lọc hoặc từ khóa tìm kiếm khác."
          actionLabel="Xóa bộ lọc"
          (action)="resetFilters()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">
                Danh sách yêu cầu đổi trả
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã phiếu</th>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Loại</th>
                  <th scope="col" class="cv-table__cell--num">Giá trị</th>
                  <th scope="col">Phí</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày yêu cầu</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr>
                    <td>
                      <button type="button" class="cv-table__link" (click)="open(item)">
                        {{ item.code }}
                      </button>
                    </td>
                    <td>{{ item.orderCode | orderCode }}</td>
                    <td>
                      <span class="cv-table__customer">
                        <span class="cv-avatar" aria-hidden="true">{{
                          initials(item.customerName)
                        }}</span>
                        {{ item.customerName }}
                      </span>
                    </td>
                    <td>{{ typeLabel(item) }}</td>
                    <td class="cv-table__cell--num">{{ totalValue(item) | vnd }}</td>
                    <td>{{ item.returnFee | vnd }}</td>
                    <td><app-status-badge kind="return" [value]="item.status" /></td>
                    <td class="cv-nowrap">{{ item.requestedAt | dateVn }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination [meta]="meta()" (pageChange)="page.set($event); load()" />
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan đổi trả">
      <div class="cv-rail__hero">
        <p class="cv-label">Yêu cầu chờ xử lý</p>
        <p class="cv-hero-num">{{ pendingCount() }}</p>
        <p class="cv-small cv-muted">{{ items().length }} phiếu trên trang</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Theo trạng thái</p>
        <ul class="status-list">
          @for (entry of statusCounts(); track entry.status) {
            <li class="status-item">
              <app-status-badge kind="return" [value]="entry.status" />
              <span class="cv-num cv-small">{{ entry.count }}</span>
            </li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Chính sách đổi trả</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Trong 7 ngày kể từ ngày nhận, hàng còn nguyên vẹn.</li>
          <li>Lỗi từ shop: CaraVeso chịu phí, đổi mới hoặc hoàn tiền.</li>
          <li>Khách đổi ý: khách chịu phí vận chuyển hai chiều.</li>
          <li>Hàng cồng kềnh cần đặt lịch đến lấy.</li>
          <li>Hoàn tiền bắt buộc có chứng từ chuyển khoản.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Chờ hoàn tiền</p>
        <p class="cv-sub-num">{{ refundPending() }}</p>
        <p class="cv-small cv-muted">
          Phiếu trả hàng đã nhận nhưng chưa chuyển tiền lại cho khách.
        </p>
      </div>
    </aside>

    @if (active(); as item) {
      <app-detail-popup
        [open]="active() !== null"
        [title]="active() ? 'Phiếu ' + active()!.code : 'Chi tiết đổi trả'"
        (closed)="active.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-spread">
            <app-status-badge kind="return" [value]="item.status" />
            <span class="cv-small cv-muted">{{ typeLabel(item) }}</span>
          </div>

          <dl class="cv-kv">
            <dt>Đơn gốc</dt>
            <dd>{{ item.orderCode | orderCode }}</dd>
            <dt>Khách hàng</dt>
            <dd>{{ item.customerName }} · {{ item.customerPhone }}</dd>
            <dt>Ngày yêu cầu</dt>
            <dd>{{ item.requestedAt | dateVn: 'datetime' }}</dd>
            <dt>Bên chịu phí</dt>
            <dd>{{ costLabel(item) }}</dd>
            <dt>Phí hoàn</dt>
            <dd class="cv-num">{{ item.returnFee | vnd }}</dd>
            <dt>Lịch lấy hàng</dt>
            <dd>
              {{ item.pickupSchedule ? (item.pickupSchedule | dateVn: 'datetime') : 'Chưa đặt' }}
            </dd>
            <dt>Mã vận đơn</dt>
            <dd>{{ item.trackingCode || '—' }}</dd>
          </dl>

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Sản phẩm yêu cầu</p>
            @for (line of item.items; track line.orderItemId) {
              <div class="line-item">
                <p class="cv-small" style="font-weight: 600">{{ line.name }}</p>
                <p class="cv-small cv-muted">
                  SKU {{ line.sku }} · SL {{ line.quantity }} · {{ line.finalAmount | vnd }}
                </p>
                <p class="cv-small" style="color: var(--cv-danger-fg)">Lý do: {{ line.reason }}</p>
                @if (line.evidence.length) {
                  <div class="evidence-row">
                    @for (image of line.evidence; track image) {
                      <span class="evidence" [attr.aria-label]="'Minh chứng ' + image">
                        <app-icon name="image" size="sm" />
                      </span>
                    }
                  </div>
                } @else {
                  <p class="cv-small cv-muted">Không có ảnh minh chứng.</p>
                }
              </div>
            }
          </section>

          @if (item.inspectionResult) {
            <div class="cv-alert-box">
              Kết quả kiểm tra: <strong>{{ inspectionLabel(item.inspectionResult) }}</strong>
            </div>
          }

          @if (item.replacement) {
            <dl class="cv-kv">
              <dt>Sản phẩm thay thế</dt>
              <dd>{{ item.replacement.productName }}</dd>
              <dt>SKU mới</dt>
              <dd>{{ item.replacement.sku }}</dd>
              <dt>Chênh lệch</dt>
              <dd class="cv-num">{{ item.replacement.differenceAmount | vnd }}</dd>
            </dl>
          }

          @if (item.rejectReason) {
            <div class="cv-error" role="alert">Lý do từ chối: {{ item.rejectReason }}</div>
          }

          @if (item.status === 'PROCESSING' && item.type === 'REFUND') {
            <div class="cv-field">
              <label class="cv-field__label" for="proof"
                >Mã giao dịch (nếu chưa đính kèm tệp)</label
              >
              <input
                class="cv-input"
                id="proof"
                [value]="proofImage()"
                (input)="proofImage.set($any($event.target).value)"
                placeholder="Nhập mã giao dịch ngân hàng"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="proof-file"
                >Tải chứng từ lên (JPEG, PNG hoặc PDF; tối đa 5 MB)</label
              >
              <input
                class="cv-input"
                id="proof-file"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                (change)="selectProofFile($event)"
              />
              @if (proofFile(); as file) {
                <p class="cv-small cv-muted">{{ file.name }}</p>
              }
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="transfer-at">Thời điểm chuyển</label>
              <input
                class="cv-input"
                id="transfer-at"
                type="datetime-local"
                [value]="transferAt()"
                (input)="transferAt.set($any($event.target).value)"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="refund-amount">Số tiền hoàn (VND)</label>
              <input
                class="cv-input"
                id="refund-amount"
                type="number"
                min="0"
                [value]="refundAmount()"
                (input)="refundAmount.set(+$any($event.target).value)"
              />
            </div>
          }
          @if (item.status === 'PROCESSING' && item.type === 'EXCHANGE') {
            <div class="cv-field">
              <label class="cv-field__label" for="replacement-sku">SKU sản phẩm thay thế</label>
              <input
                class="cv-input"
                id="replacement-sku"
                [value]="replacementSku()"
                (input)="replacementSku.set($any($event.target).value)"
                placeholder="Nhập SKU đang kinh doanh"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="replacement-quantity">Số lượng</label>
              <input
                class="cv-input"
                id="replacement-quantity"
                type="number"
                min="1"
                step="1"
                [value]="replacementQuantity()"
                (input)="replacementQuantity.set(+$any($event.target).value)"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="replacement-tracking"
                >Mã vận đơn hàng thay thế</label
              >
              <input
                class="cv-input"
                id="replacement-tracking"
                [value]="replacementTrackingCode()"
                (input)="replacementTrackingCode.set($any($event.target).value)"
                placeholder="Mã vận đơn giao hàng mới"
              />
            </div>
          }

          @if (activeError()) {
            <div class="cv-error" role="alert">{{ activeError() }}</div>
          }
        </div>
        <div popupFooter>
          @if (item.status === 'PENDING') {
            <button
              type="button"
              class="cv-btn cv-btn--danger"
              [disabled]="busy()"
              (click)="openReject(item)"
            >
              Từ chối
            </button>
            <button
              type="button"
              class="cv-btn cv-btn--accent"
              [disabled]="busy()"
              (click)="confirm(item)"
            >
              Xác nhận yêu cầu
            </button>
          }
          @if (item.status === 'CONFIRMED') {
            <button
              type="button"
              class="cv-btn cv-btn--secondary"
              [disabled]="busy()"
              (click)="schedule(item)"
            >
              Lưu lịch lấy
            </button>
            <button
              type="button"
              class="cv-btn cv-btn--primary"
              [disabled]="busy()"
              (click)="openReceive(item)"
            >
              Đã nhận hàng
            </button>
          }
          @if (item.status === 'AWAITING_GOODS') {
            <button
              type="button"
              class="cv-btn cv-btn--primary"
              [disabled]="busy()"
              (click)="openReceive(item)"
            >
              Nhận hàng & kiểm tra
            </button>
          }
          @if (item.status === 'PROCESSING') {
            @if (item.type === 'REFUND') {
              <button
                type="button"
                class="cv-btn cv-btn--accent"
                [disabled]="busy()"
                (click)="refund(item)"
              >
                Xác nhận đã hoàn tiền
              </button>
            } @else {
              <button
                type="button"
                class="cv-btn cv-btn--accent"
                [disabled]="busy()"
                (click)="complete(item)"
              >
                Hoàn tất đổi hàng
              </button>
            }
          }
          @if (item.status === 'COMPLETED' || item.status === 'REJECTED') {
            <button type="button" class="cv-btn cv-btn--secondary" (click)="active.set(null)">
              Đóng
            </button>
          }
        </div>
      </app-detail-popup>
    }

    <app-confirm-dialog
      [open]="pendingAction() !== null"
      [title]="pendingAction()?.title ?? ''"
      [message]="pendingAction()?.message ?? ''"
      confirmLabel="Xác nhận"
      [danger]="pendingAction()?.danger ?? false"
      [loading]="busy()"
      (confirmed)="commitConfirm()"
      (cancelled)="pendingAction.set(null)"
    >
      @if (pendingAction()?.kind === 'SCHEDULE') {
        <div class="cv-stack" style="margin-top: 12px">
          <div class="cv-field">
            <label class="cv-field__label" for="pickup">Lịch lấy hàng</label>
            <input
              class="cv-input"
              id="pickup"
              type="datetime-local"
              [value]="pickupSchedule()"
              (input)="pickupSchedule.set($any($event.target).value)"
            />
          </div>
          <div class="cv-field">
            <label class="cv-field__label" for="cost-bearer">Bên chịu phí</label>
            <select
              class="cv-select"
              id="cost-bearer"
              [value]="costBearer()"
              (change)="costBearer.set($any($event.target).value)"
            >
              @for (option of costOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="cv-field">
            <label class="cv-field__label" for="return-fee">Phí hoàn (VND)</label>
            <input
              class="cv-input"
              id="return-fee"
              type="number"
              min="0"
              [value]="returnFee()"
              (input)="returnFee.set(+$any($event.target).value)"
            />
          </div>
        </div>
      }
      @if (pendingAction()?.kind === 'RECEIVE') {
        <div class="cv-field" style="margin-top: 12px">
          <label class="cv-field__label" for="inspection">Kết quả kiểm tra</label>
          <select
            class="cv-select"
            id="inspection"
            [value]="inspection()"
            (change)="inspection.set($any($event.target).value)"
          >
            @for (option of inspectionOptions; track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </div>
      }
    </app-confirm-dialog>

    <app-reason-dialog
      [open]="rejecting() !== null"
      title="Từ chối yêu cầu đổi trả"
      confirmLabel="Từ chối"
      noteLabel="Lý do từ chối"
      [noteRequired]="true"
      [loading]="busy()"
      (submitted)="reject($event.note)"
      (cancelled)="rejecting.set(null)"
    />
  `,
  styles: [
    `
      .status-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .status-item {
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

      .line-item {
        padding: 10px 0;
        border-bottom: 1px solid var(--cv-border);
      }

      .line-item:last-child {
        border-bottom: 0;
      }

      .evidence-row {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }

      .evidence {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
        color: var(--cv-muted);
      }
    `,
  ],
})
export class ReturnsScreenComponent {
  private readonly api = inject(AdminReturnApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusOptions = STATUS_OPTIONS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly inspectionOptions = INSPECTION_OPTIONS;
  readonly costOptions = COST_OPTIONS;

  readonly keyword = signal('');
  readonly status = signal('ALL');
  readonly type = signal('ALL');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly items = signal<ReturnRequest[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  readonly active = signal<ReturnRequest | null>(null);
  readonly activeError = signal('');
  readonly rejecting = signal<ReturnRequest | null>(null);
  readonly busy = signal(false);

  readonly pendingAction = signal<{
    kind: 'CONFIRM' | 'REJECT' | 'SCHEDULE' | 'RECEIVE' | 'REFUND' | 'COMPLETE';
    title: string;
    message: string;
    danger?: boolean;
    item: ReturnRequest;
  } | null>(null);

  readonly pickupSchedule = signal('');
  readonly costBearer = signal<ReturnCostBearer>(ReturnCostBearer.SHOP);
  readonly returnFee = signal(0);
  readonly inspection = signal<InspectionResult>(InspectionResult.PASS);
  readonly proofImage = signal('');
  readonly proofFile = signal<File | null>(null);
  readonly transferAt = signal('');
  readonly refundAmount = signal(0);
  readonly replacementSku = signal('');
  readonly replacementQuantity = signal(1);
  readonly replacementTrackingCode = signal('');

  readonly pendingCount = computed(
    () => this.items().filter((item) => item.status === ReturnStatus.PENDING).length,
  );
  readonly refundPending = computed(
    () => this.items().filter((item) => item.refund && !item.refund.completed).length,
  );
  readonly statusCounts = computed(() => {
    return Object.values(ReturnStatus).map((status) => ({
      status,
      count: this.items().filter((item) => item.status === status).length,
    }));
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        q: this.keyword() || undefined,
        status: this.status() as ReturnStatus | 'ALL',
        type: this.type() as ReturnType | 'ALL',
        page: this.page(),
        limit: 20,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.data);
          this.meta.set(response.meta);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được danh sách đổi trả. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });
  }

  onSearch(value: string): void {
    this.keyword.set(value);
    this.page.set(1);
    this.load();
  }

  resetFilters(): void {
    this.keyword.set('');
    this.status.set('ALL');
    this.type.set('ALL');
    this.page.set(1);
    this.load();
  }

  exportCsv(): void {
    if (this.exporting()) return;

    const query = {
      q: this.keyword() || undefined,
      status: this.status() as ReturnStatus | 'ALL',
      type: this.type() as ReturnType | 'ALL',
    };
    this.exporting.set(true);
    loadAllPages((page, limit) => this.api.list({ ...query, page, limit }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (requests) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `yeu-cau-doi-tra-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Mã phiếu', value: (item) => item.code },
              { label: 'Mã đơn', value: (item) => item.orderCode },
              { label: 'Khách hàng', value: (item) => item.customerName },
              { label: 'Số điện thoại', value: (item) => item.customerPhone },
              { label: 'Loại yêu cầu', value: (item) => RETURN_TYPE_LABEL[item.type] },
              { label: 'Trạng thái', value: (item) => RETURN_STATUS_LABEL[item.status] },
              { label: 'Ngày yêu cầu', value: (item) => item.requestedAt },
              { label: 'Phí hoàn hàng', value: (item) => item.returnFee },
              { label: 'Mã vận đơn hoàn', value: (item) => item.trackingCode },
              { label: 'Kết quả kiểm tra', value: (item) => item.inspectionResult },
              { label: 'Số tiền hoàn', value: (item) => item.refund?.amount },
              { label: 'Đã hoàn tiền', value: (item) => (item.refund?.completed ? 'Có' : 'Không') },
            ],
            requests,
          );
          this.notifications.show(
            downloaded
              ? `Đã tải xuống ${requests.length} yêu cầu đổi trả.`
              : 'Không có yêu cầu đổi trả phù hợp để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được danh sách đổi trả để xuất file.', 'error');
        },
      });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  typeLabel(item: ReturnRequest): string {
    return RETURN_TYPE_LABEL[item.type];
  }

  costLabel(item: ReturnRequest): string {
    return RETURN_COST_BEARER_LABEL[item.costBearer];
  }

  inspectionLabel(value: InspectionResult): string {
    return INSPECTION_RESULT_LABEL[value];
  }

  totalValue(item: ReturnRequest): number {
    return item.items.reduce((sum, line) => sum + line.finalAmount, 0);
  }

  open(item: ReturnRequest): void {
    this.active.set(item);
    this.activeError.set('');
    this.proofImage.set(item.refund?.proofImage ?? '');
    this.proofFile.set(null);
    this.transferAt.set(new Date().toISOString().slice(0, 16));
    this.refundAmount.set(item.refund?.amount ?? this.totalValue(item));
    this.replacementSku.set(item.replacement?.sku ?? '');
    this.replacementQuantity.set(item.replacement?.quantity ?? item.items[0]?.quantity ?? 1);
    this.replacementTrackingCode.set(item.replacement?.trackingCode ?? '');
  }

  confirm(item: ReturnRequest): void {
    this.pendingAction.set({
      kind: 'CONFIRM',
      title: 'Xác nhận yêu cầu đổi trả',
      message: `Xác nhận phiếu ${item.code}? Khách sẽ nhận thông báo và bước tiếp theo là đặt lịch lấy hàng.`,
      item,
    });
  }

  schedule(item: ReturnRequest): void {
    this.pickupSchedule.set(
      item.pickupSchedule
        ? item.pickupSchedule.slice(0, 16)
        : new Date().toISOString().slice(0, 16),
    );
    this.costBearer.set(item.costBearer);
    this.returnFee.set(item.returnFee);
    this.pendingAction.set({
      kind: 'SCHEDULE',
      title: 'Lưu lịch lấy hàng',
      message: 'Đặt lịch lấy hàng và xác định bên chịu phí hoàn.',
      item,
    });
  }

  openReceive(item: ReturnRequest): void {
    this.inspection.set(item.inspectionResult ?? InspectionResult.PASS);
    this.pendingAction.set({
      kind: 'RECEIVE',
      title: 'Nhận hàng & kiểm tra',
      message: `Ghi nhận đã nhận hàng hoàn của phiếu ${item.code} và lưu kết quả kiểm tra.`,
      item,
    });
  }

  refund(item: ReturnRequest): void {
    if (!this.proofImage().trim() && !this.proofFile()) {
      this.activeError.set('Vui lòng nhập mã giao dịch hoặc tải chứng từ lên trước khi xác nhận.');
      return;
    }
    if (!this.transferAt()) {
      this.activeError.set('Vui lòng nhập thời điểm chuyển tiền.');
      return;
    }
    this.pendingAction.set({
      kind: 'REFUND',
      title: 'Xác nhận hoàn tiền',
      message: `Hoàn ${this.refundAmount().toLocaleString('vi-VN')}đ cho khách và lưu chứng từ hoàn tiền. Phiếu sẽ chuyển sang Hoàn tất.`,
      item,
    });
  }

  selectProofFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.proofFile.set(null);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      this.proofFile.set(null);
      input.value = '';
      this.activeError.set('Chỉ hỗ trợ ảnh JPEG, PNG hoặc tài liệu PDF.');
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      this.proofFile.set(null);
      input.value = '';
      this.activeError.set('Tệp chứng từ phải lớn hơn 0 byte và không vượt quá 5 MB.');
      return;
    }

    this.activeError.set('');
    this.proofFile.set(file);
  }

  complete(item: ReturnRequest): void {
    if (!this.replacementSku().trim() || !this.replacementTrackingCode().trim()) {
      this.activeError.set('Vui lòng nhập SKU và mã vận đơn của sản phẩm thay thế.');
      return;
    }
    if (!Number.isInteger(this.replacementQuantity()) || this.replacementQuantity() < 1) {
      this.activeError.set('Số lượng sản phẩm thay thế phải là số nguyên lớn hơn 0.');
      return;
    }
    this.pendingAction.set({
      kind: 'COMPLETE',
      title: 'Hoàn tất đổi hàng',
      message: `Xác nhận đã giao sản phẩm thay thế cho khách và đóng phiếu ${item.code}.`,
      item,
    });
  }

  openReject(item: ReturnRequest): void {
    this.rejecting.set(item);
  }

  reject(reason: string): void {
    const item = this.rejecting();
    if (!item) return;
    this.busy.set(true);
    this.api
      .reject(item.id, { rejectReason: reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.rejecting.set(null);
          this.patch(updated);
          this.notifications.show(`Đã từ chối phiếu ${updated.code}.`);
        },
        error: () => {
          this.busy.set(false);
          this.notifications.show('Không từ chối được phiếu.', 'error');
        },
      });
  }

  commitConfirm(): void {
    const action = this.pendingAction();
    if (!action) return;
    this.busy.set(true);
    const item = action.item;

    const request$ =
      action.kind === 'CONFIRM'
        ? this.api.confirm(item.id)
        : action.kind === 'SCHEDULE'
          ? this.api.update(item.id, {
              costBearer: this.costBearer(),
              returnFee: this.returnFee(),
              pickupSchedule: this.pickupSchedule()
                ? new Date(this.pickupSchedule()).toISOString()
                : null,
              trackingCode: item.trackingCode ?? null,
            })
          : action.kind === 'RECEIVE'
            ? this.api.receive(item.id, { inspectionResult: this.inspection() })
            : action.kind === 'REFUND'
              ? this.submitRefund(item)
              : this.api
                  .update(item.id, {
                    replacement: {
                      sku: this.replacementSku().trim(),
                      quantity: this.replacementQuantity(),
                      trackingCode: this.replacementTrackingCode().trim(),
                    },
                  })
                  .pipe(concatMap(() => this.api.complete(item.id)));

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.pendingAction.set(null);
        this.patch(updated);
        this.notifications.show(`Đã cập nhật phiếu ${updated.code}.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const message = parseApiError(error).message;
        this.activeError.set(message);
        this.notifications.show(message, 'error');
      },
    });
  }

  private patch(updated: ReturnRequest): void {
    this.items.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    if (this.active()?.id === updated.id) this.active.set(updated);
  }

  private submitRefund(item: ReturnRequest) {
    const request = {
      transactionAt: new Date(this.transferAt()).toISOString(),
      amount: this.refundAmount(),
      proofImage: this.proofImage().trim(),
    };
    const file = this.proofFile();
    if (!file) return this.api.refund(item.id, request);

    return this.api
      .uploadProof(file)
      .pipe(concatMap((proofImage) => this.api.refund(item.id, { ...request, proofImage })));
  }
}
