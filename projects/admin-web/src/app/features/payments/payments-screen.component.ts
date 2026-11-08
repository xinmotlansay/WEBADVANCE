import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap } from 'rxjs';
import {
  RECONCILIATION_LABEL,
  RECORD_SOURCE_LABEL,
  REFUND_DESTINATION_LABEL,
  REFUND_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  RESOLVE_ACTION_LABEL,
  RECONCILIATION_STATUS_TONE,
  TRANSACTION_TYPE_LABEL,
  type PaymentException,
  type PaymentTransaction,
  type ResolveAction,
} from 'shared';
import { AdminPaymentApi } from '../../services/api/admin-payment.service';
import { loadAllPages } from '../../core/api/load-all-pages';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, OrderCodePipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../services/ui/notification.service';
import { ConfirmDialogComponent } from '../../shared/ui/dialogs/confirm-dialog.component';
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

const RECONCILIATION_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  ...Object.entries(RECONCILIATION_LABEL).map(([value, label]) => ({ value, label })),
];

const TYPE_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Tất cả loại' },
  ...Object.entries(TRANSACTION_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

const REFUND_STATUS_OPTIONS: FilterOption[] = [
  { value: 'ALL', label: 'Mọi tình trạng hoàn' },
  ...Object.entries(REFUND_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const RESOLVE_OPTIONS: Array<{ value: ResolveAction; label: string }> = (
  Object.keys(RESOLVE_ACTION_LABEL) as ResolveAction[]
).map((value) => ({ value, label: RESOLVE_ACTION_LABEL[value] }));

@Component({
  selector: 'app-payments-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    FilterChipComponent,
    PaginationComponent,
    DetailPopupComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    VndPipe,
    ShortVndPipe,
    DateVnPipe,
    OrderCodePipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Thanh toán & đối soát"
        subtitle="Theo dõi giao dịch và xử lý các khoản chuyển khoản không khớp."
        searchId="payments-search"
        searchPlaceholder="Mã đơn, mã giao dịch, khách…"
        [searchValue]="keyword()"
        (searchChange)="onSearch($event)"
        [hasNotifications]="exceptions().length > 0"
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
          {{ exporting() ? 'Đang xuất…' : 'Xuất đối soát' }}
        </button>
      </app-page-header>

      <div class="cv-filter-row">
        <app-filter-chip
          label="Đối soát"
          [options]="reconciliationOptions"
          [value]="reconciliation()"
          (valueChange)="reconciliation.set($event); page.set(1); load()"
        />
        <app-filter-chip
          label="Loại"
          [options]="typeOptions"
          [value]="type()"
          (valueChange)="type.set($event); page.set(1); load()"
        />
        <app-filter-chip
          label="Hoàn tiền"
          [options]="refundStatusOptions"
          [value]="refundStatus()"
          (valueChange)="refundStatus.set($event); page.set(1); load()"
        />
        <button
          type="button"
          class="cv-chip"
          [class.cv-chip--active]="onlyPending()"
          [attr.aria-pressed]="onlyPending()"
          (click)="onlyPending.set(!onlyPending())"
        >
          Cần xử lý ({{ pendingCount() }})
        </button>
        @if (keyword() || onlyPending() || reconciliation() !== 'ALL' || type() !== 'ALL' || refundStatus() !== 'ALL') {
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
      } @else if (visible().length === 0) {
        <app-empty-state
          icon="credit-card"
          title="Không có giao dịch phù hợp"
          message="Thử đổi bộ lọc đối soát hoặc từ khóa tìm kiếm."
          [actionLabel]="'Xóa bộ lọc'"
          (action)="resetFilters()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">
                Danh sách giao dịch thanh toán
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã giao dịch</th>
                  <th scope="col">Đơn hàng</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Loại</th>
                  <th scope="col" class="cv-table__cell--num">Số tiền</th>
                  <th scope="col">Đối soát</th>
                  <th scope="col">Hoàn tiền</th>
                  <th scope="col">Nguồn</th>
                  <th scope="col">Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                @for (item of visible(); track item.id) {
                  <tr
                    [class.cv-table__row--clickable]="needsAction(item)"
                    (click)="needsAction(item) && openAction(item)"
                  >
                    <td>
                      @if (needsAction(item)) {
                        <button type="button" class="cv-table__link cv-table__link--alert">
                          <span class="cv-sr-only">Cần xử lý. </span>
                          <span class="cv-num">{{
                            item.bankTransactionCode || item.originalTransactionCode || '—'
                          }}</span>
                        </button>
                      } @else {
                        <span class="cv-num">{{
                          item.bankTransactionCode || item.originalTransactionCode || '—'
                        }}</span>
                      }
                    </td>
                    <td>
                      @if (item.orderCode) {
                        <span class="cv-table__link">{{ item.orderCode | orderCode }}</span>
                      } @else {
                        <span class="cv-muted">Chưa khớp đơn</span>
                      }
                    </td>
                    <td>{{ item.customerName || '—' }}</td>
                    <td>{{ typeLabel(item) }}</td>
                    <td class="cv-table__cell--num">{{ item.amount | vnd }}</td>
                    <td>
                      <span
                        class="cv-badge"
                        [class]="'cv-badge cv-badge--' + toneOf(item.reconciliationStatus)"
                      >
                        {{ labelOf(item.reconciliationStatus) }}
                      </span>
                    </td>
                    <td>
                      @if (item.type === 'REFUND') {
                        <span
                          class="cv-badge"
                          [class]="'cv-badge cv-badge--' + (item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'danger' : item.status === 'PROCESSING' ? 'info' : 'warning')"
                        >
                          {{ refundLabel(item) }}
                        </span>
                      } @else {
                        <span class="cv-muted">—</span>
                      }
                    </td>
                    <td>{{ sourceLabel(item.recordSource) }}</td>
                    <td class="cv-nowrap">{{ item.transactionAt | dateVn: 'datetime' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (!onlyPending()) {
            <app-pagination [meta]="meta()" (pageChange)="page.set($event); load()" />
          }
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan thanh toán">
      <div class="cv-rail__hero">
        <p class="cv-label">Tổng thu trên trang</p>
        <p class="cv-hero-num">{{ pageTotal() | shortVnd }}</p>
        <p class="cv-small cv-muted">{{ visible().length }} giao dịch</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Ngoại lệ đang chờ</p>
        <ul class="cv-stack" style="gap: 10px; list-style: none; margin: 0; padding: 0">
          @for (item of exceptions(); track item.transaction.id) {
            <li class="cv-spread cv-small">
              <span>{{ labelOf(item.reason) }}</span>
              <span class="cv-num">{{ item.receivedAmount - item.expectedAmount | vnd }}</span>
            </li>
          } @empty {
            <li class="cv-small cv-muted">Không có ngoại lệ.</li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Nguyên tắc đối soát</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Mọi xử lý thủ công bắt buộc ghi chú.</li>
          <li>Một giao dịch ngân hàng chỉ được xử lý một lần.</li>
          <li>Đơn chuyển khoản: hoàn về tài khoản đã chuyển tiền, theo quy định của ngân hàng.</li>
          <li>Đơn COD khi trả hàng: hoàn về tài khoản khách đã nhập.</li>
          <li>Hoàn tiền xong phải tải chứng từ và ghi chú.</li>
          <li>Chênh lệch thiếu/thừa phải xử lý trước khi đóng ca.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Doanh thu ghi nhận</p>
        <p class="cv-sub-num">{{ pageTotal() | vnd }}</p>
        <p class="cv-small cv-muted">Không gồm giao dịch đang chờ xử lý.</p>
      </div>
    </aside>

    @if (refundDetail(); as item) {
      <app-detail-popup
        [open]="refundDetail() !== null"
        title="Khoản cần hoàn tiền"
        (closed)="refundDetail.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-alert-box">
            {{ refundSourceLabel(item) }} · {{ refundLabel(item) }} ·
            {{ item.transactionAt | dateVn: 'datetime' }}
          </div>
          <dl class="cv-kv">
            <dt>Đơn hàng</dt>
            <dd>{{ item.orderCode ? (item.orderCode | orderCode) : 'Chưa gắn đơn' }}</dd>
            @if (item.customerName) {
              <dt>Khách hàng</dt>
              <dd>{{ item.customerName }}</dd>
            }
            <dt>Cần hoàn</dt>
            <dd class="cv-num">{{ item.amount | vnd }}</dd>
            <dt>Hoàn về</dt>
            <dd>{{ destinationLabel(item) }}</dd>
            @if (item.refundAccount; as account) {
              <dt>Ngân hàng</dt>
              <dd>{{ account.bankName }}</dd>
              <dt>Số tài khoản</dt>
              <dd class="cv-num">{{ account.accountNumber }}</dd>
              <dt>Chủ tài khoản</dt>
              <dd>{{ account.accountHolder }}</dd>
            } @else if (item.refundTo === 'SOURCE_BANK' && item.originalTransactionCode) {
              <dt>Giao dịch gốc</dt>
              <dd class="cv-num">{{ item.originalTransactionCode }}</dd>
            }
            @if (item.returnCode) {
              <dt>Phiếu trả hàng</dt>
              <dd>{{ item.returnCode }}</dd>
            }
          </dl>
          @if (item.refundTo === 'CUSTOMER_ACCOUNT' && !item.refundAccount) {
            <p class="cv-small cv-error">Chưa có tài khoản nhận hoàn tiền, cần liên hệ khách.</p>
          }
          @if (item.refundTo === 'SOURCE_BANK') {
            <p class="cv-small cv-muted">
              Hoàn về tài khoản đã chuyển tiền, theo quy định của ngân hàng.
            </p>
          }
          @if (item.note) {
            <p class="cv-small cv-muted">{{ item.note }}</p>
          }
        </div>
        <div popupFooter>
          <button type="button" class="cv-btn cv-btn--secondary" (click)="refundDetail.set(null)">
            Đóng
          </button>
          <button
            type="button"
            class="cv-btn cv-btn--primary"
            [disabled]="item.refundTo === 'CUSTOMER_ACCOUNT' && !item.refundAccount"
            (click)="startingRefund.set(item); refundDetail.set(null)"
          >
            Xác nhận hoàn tiền
          </button>
        </div>
      </app-detail-popup>
    }

    @if (resolving(); as item) {
      <app-detail-popup
        [open]="resolving() !== null"
        title="Xử lý đối soát thủ công"
        (closed)="resolving.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-alert-box">
            Giao dịch {{ item.transaction.bankTransactionCode }} đang ở trạng thái
            <strong>{{ labelOf(item.reason) }}</strong
            >. Mọi thay đổi được ghi nhật ký.
          </div>

          <dl class="cv-kv">
            <dt>Cần thu</dt>
            <dd class="cv-num">{{ item.expectedAmount | vnd }}</dd>
            <dt>Đã nhận</dt>
            <dd class="cv-num">{{ item.receivedAmount | vnd }}</dd>
            <dt>Chênh lệch</dt>
            <dd class="cv-num">{{ item.receivedAmount - item.expectedAmount | vnd }}</dd>
          </dl>

          <div class="cv-field">
            <label class="cv-field__label" for="resolve-action">Cách xử lý</label>
            <select
              class="cv-select"
              id="resolve-action"
              [value]="action()"
              (change)="action.set($any($event.target).value)"
            >
              @for (option of resolveOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>

          <div class="cv-field">
            <label class="cv-field__label" for="resolve-note">Ghi chú (bắt buộc)</label>
            <textarea
              class="cv-textarea"
              id="resolve-note"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
              placeholder="Ví dụ: đã xác minh sao kê, khách chuyển thiếu 500.000đ và bổ sung ngày 31/10"
            ></textarea>
          </div>

          @if (resolveError()) {
            <div class="cv-error" role="alert">{{ resolveError() }}</div>
          }
        </div>
        <div popupFooter>
          <button type="button" class="cv-btn cv-btn--secondary" (click)="resolving.set(null)">
            Hủy
          </button>
          <button
            type="button"
            class="cv-btn cv-btn--primary"
            [disabled]="busy()"
            (click)="submitResolve()"
          >
            {{ busy() ? 'Đang xử lý…' : 'Xác nhận xử lý' }}
          </button>
        </div>
      </app-detail-popup>
    }

    @if (refunding(); as refund) {
      <app-detail-popup
        [open]="refunding() !== null"
        title="Hoàn tất hoàn tiền"
        (closed)="refunding.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-alert-box">
            Hoàn <strong>{{ refund.amount | vnd }}</strong> cho khách
            {{ destinationLabel(refund).toLowerCase() }}. Chỉ hoàn tất sau khi đã chuyển tiền (chưa nối ngân hàng nên báo thủ công); phiếu trả hàng liên quan sẽ tự chuyển Hoàn tất. Thao tác được ghi nhật ký.
          </div>

          @if (refund.refundAccount; as account) {
            <dl class="cv-kv">
              <dt>Ngân hàng</dt>
              <dd>{{ account.bankName }}</dd>
              <dt>Số tài khoản</dt>
              <dd class="cv-num">{{ account.accountNumber }}</dd>
              <dt>Chủ tài khoản</dt>
              <dd>{{ account.accountHolder }}</dd>
            </dl>
          } @else if (refund.originalTransactionCode) {
            <dl class="cv-kv">
              <dt>Giao dịch gốc</dt>
              <dd class="cv-num">{{ refund.originalTransactionCode }}</dd>
            </dl>
          }

          <div class="cv-field">
            <label class="cv-field__label" for="refund-amount">Số tiền đã hoàn (VND)</label>
            <input
              class="cv-input"
              id="refund-amount"
              type="number"
              min="1"
              [max]="refund.amount"
              [value]="refundAmount()"
              (input)="refundAmount.set(+$any($event.target).value)"
            />
          </div>
          <div class="cv-field">
            <label class="cv-field__label" for="refund-at">Thời điểm chuyển</label>
            <input
              class="cv-input"
              id="refund-at"
              type="datetime-local"
              [value]="refundAt()"
              (input)="refundAt.set($any($event.target).value)"
            />
          </div>
          <div class="cv-field">
            <label class="cv-field__label" for="refund-proof"
              >Chứng từ chuyển tiền (JPEG, PNG hoặc PDF; tối đa 5 MB)</label
            >
            <input
              class="cv-input"
              id="refund-proof"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              (change)="selectRefundProof($event)"
            />
            @if (refundProof(); as file) {
              <p class="cv-small cv-muted">{{ file.name }}</p>
            }
          </div>
          <div class="cv-field">
            <label class="cv-field__label" for="refund-note">Ghi chú (bắt buộc)</label>
            <textarea
              class="cv-textarea"
              id="refund-note"
              [value]="refundNote()"
              (input)="refundNote.set($any($event.target).value)"
              placeholder="Ví dụ: đã hoàn qua Vietcombank, mã giao dịch hoàn FT2611..."
            ></textarea>
          </div>

          @if (refundError()) {
            <div class="cv-error" role="alert">{{ refundError() }}</div>
          }
        </div>
        <div popupFooter>
          <button type="button" class="cv-btn cv-btn--secondary" (click)="refunding.set(null)">
            Hủy
          </button>
          <button
            type="button"
            class="cv-btn cv-btn--primary"
            [disabled]="busy()"
            (click)="submitRefund()"
          >
            {{ busy() ? 'Đang lưu…' : 'Hoàn tất hoàn tiền' }}
          </button>
        </div>
      </app-detail-popup>
    }

    <app-confirm-dialog
      [open]="startingRefund() !== null"
      title="Xác nhận hoàn tiền"
      [message]="startMessage()"
      confirmLabel="Xác nhận hoàn tiền"
      [loading]="busy()"
      (confirmed)="commitStartRefund()"
      (cancelled)="startingRefund.set(null)"
    />

    <app-confirm-dialog
      [open]="confirmOpen()"
      title="Xác nhận xử lý đối soát"
      [message]="confirmMessage()"
      confirmLabel="Xác nhận"
      [loading]="busy()"
      (confirmed)="commitResolve()"
      (cancelled)="confirmOpen.set(false)"
    />
  `,
  styles: [
    `
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
export class PaymentsScreenComponent {
  private readonly api = inject(AdminPaymentApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reconciliationOptions = RECONCILIATION_OPTIONS;
  readonly resolveOptions = RESOLVE_OPTIONS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly refundStatusOptions = REFUND_STATUS_OPTIONS;

  readonly keyword = signal('');
  readonly reconciliation = signal('ALL');
  readonly type = signal('ALL');
  readonly refundStatus = signal('ALL');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  readonly exceptions = signal<PaymentException[]>([]);
  readonly exceptionLoading = signal(true);

  readonly refunds = signal<PaymentTransaction[]>([]);
  readonly refundLoading = signal(true);
  readonly refunding = signal<PaymentTransaction | null>(null);
  readonly refundDetail = signal<PaymentTransaction | null>(null);
  private readonly exceptionByTransaction = computed(
    () => new Map(this.exceptions().map((entry) => [entry.transaction.id, entry])),
  );
  readonly onlyPending = signal(false);
  private readonly pendingItems = computed(() => {
    const byId = new Map<string, PaymentTransaction>();
    for (const entry of this.exceptions()) byId.set(entry.transaction.id, entry.transaction);
    for (const entry of this.refunds()) byId.set(entry.id, entry);
    return [...byId.values()];
  });
  readonly pendingCount = computed(() => this.pendingItems().length);
  /** Bật "Cần xử lý": gom ngoại lệ QR và khoản hoàn chưa xong, không phân trang. */
  readonly visible = computed(() => {
    if (!this.onlyPending()) return this.transactions();
    const keyword = this.keyword().trim().toLowerCase();
    return this.pendingItems()
      .filter(
        (item) =>
          !keyword ||
          [item.bankTransactionCode, item.originalTransactionCode, item.orderCode, item.customerName]
            .some((value) => value?.toLowerCase().includes(keyword)),
      )
      .sort((a, b) => b.transactionAt.localeCompare(a.transactionAt));
  });
  private readonly refundIds = computed(() => new Set(this.refunds().map((entry) => entry.id)));
  readonly startingRefund = signal<PaymentTransaction | null>(null);
  readonly startMessage = computed(() => {
    const item = this.startingRefund();
    if (!item) return '';
    return `Xác nhận hoàn ${item.amount.toLocaleString('vi-VN')}đ cho khách (${this.destinationLabel(item).toLowerCase()}). Khoản hoàn chuyển sang "Đang hoàn tiền"; sau khi chuyển tiền, bấm "Hoàn tất hoàn tiền" và tải chứng từ.`;
  });
  readonly refundAmount = signal(0);
  readonly refundAt = signal('');
  readonly refundNote = signal('');
  readonly refundProof = signal<File | null>(null);
  readonly refundError = signal('');

  readonly resolving = signal<PaymentException | null>(null);
  readonly action = signal<ResolveAction>('MARK_PAID');
  readonly note = signal('');
  readonly resolveError = signal('');
  readonly confirmOpen = signal(false);
  readonly busy = signal(false);

  readonly pageTotal = computed(() =>
    this.visible().reduce((sum, item) => sum + item.amount, 0),
  );

  readonly confirmMessage = computed(() => {
    const item = this.resolving();
    if (!item) return '';
    return `Giao dịch ${item.transaction.bankTransactionCode} sẽ được xử lý theo cách "${RESOLVE_ACTION_LABEL[this.action()]}". Thao tác được ghi nhật ký và không thể hoàn tác.`;
  });

  constructor() {
    this.load();
    this.loadExceptions();
    this.loadRefunds();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        q: this.keyword() || undefined,
        reconciliationStatus: this.reconciliation() as never,
        type: this.type() as never,
        status: this.refundStatus() as never,
        page: this.page(),
        limit: 20,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.transactions.set(response.data);
          this.meta.set(response.meta);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được danh sách giao dịch. Vui lòng thử lại.');
          this.loading.set(false);
        },
      });
  }

  loadExceptions(): void {
    this.exceptionLoading.set(true);
    this.api
      .exceptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.exceptions.set(items);
          this.exceptionLoading.set(false);
        },
        error: () => {
          this.exceptionLoading.set(false);
        },
      });
  }

  loadRefunds(): void {
    this.refundLoading.set(true);
    this.api
      .pendingRefunds()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.refunds.set(items);
          this.refundLoading.set(false);
        },
        error: () => this.refundLoading.set(false),
      });
  }

  commitStartRefund(): void {
    const item = this.startingRefund();
    if (!item) return;
    this.busy.set(true);
    this.api
      .startRefund(item.id, {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.startingRefund.set(null);
          this.notifications.show('Đã xác nhận hoàn tiền, khoản hoàn chuyển sang Đang hoàn tiền.');
          this.loadRefunds();
          this.load();
        },
        error: (error: { error?: { error?: { message?: string } } }) => {
          this.busy.set(false);
          this.startingRefund.set(null);
          this.notifications.show(
            error?.error?.error?.message ?? 'Không xác nhận được hoàn tiền, vui lòng thử lại.',
            'error',
          );
        },
      });
  }

  /** Giao dịch đang chờ Admin: ngoại lệ QR cần đối soát hoặc khoản hoàn chưa hoàn tất. */
  needsAction(item: PaymentTransaction): boolean {
    return this.exceptionByTransaction().has(item.id) || this.refundIds().has(item.id);
  }

  openAction(item: PaymentTransaction): void {
    const exception = this.exceptionByTransaction().get(item.id);
    if (exception) {
      this.openResolve(exception);
      return;
    }
    const refund = this.refunds().find((entry) => entry.id === item.id) ?? item;
    if (refund.status === 'PROCESSING') this.openRefund(refund);
    else this.refundDetail.set(refund);
  }

  openRefund(item: PaymentTransaction): void {
    this.refunding.set(item);
    this.refundAmount.set(item.amount);
    this.refundAt.set(this.nowLocal());
    this.refundNote.set('');
    this.refundProof.set(null);
    this.refundError.set('');
  }

  selectRefundProof(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.refundProof.set(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      this.refundProof.set(null);
      input.value = '';
      this.refundError.set('Chỉ hỗ trợ ảnh JPEG, PNG hoặc tài liệu PDF.');
      return;
    }
    if (file.size === 0 || file.size > MAX_PROOF_BYTES) {
      this.refundProof.set(null);
      input.value = '';
      this.refundError.set('Tệp chứng từ phải lớn hơn 0 byte và không vượt quá 5 MB.');
      return;
    }
    this.refundError.set('');
    this.refundProof.set(file);
  }

  submitRefund(): void {
    const item = this.refunding();
    if (!item) return;
    const amount = this.refundAmount();
    if (!(amount > 0) || amount > item.amount) {
      this.refundError.set('Số tiền hoàn phải lớn hơn 0 và không vượt số tiền cần hoàn.');
      return;
    }
    if (!this.refundAt()) {
      this.refundError.set('Vui lòng chọn thời điểm chuyển tiền.');
      return;
    }
    const file = this.refundProof();
    if (!file) {
      this.refundError.set('Vui lòng tải lên chứng từ chuyển tiền.');
      return;
    }
    if (!this.refundNote().trim()) {
      this.refundError.set('Vui lòng ghi chú hoàn tiền để lưu nhật ký.');
      return;
    }
    this.refundError.set('');
    this.busy.set(true);
    this.api
      .uploadProof(file)
      .pipe(
        concatMap((proofImage) =>
          this.api.completeRefund(item.id, {
            amount,
            transactionAt: new Date(this.refundAt()).toISOString(),
            proofImage,
            note: this.refundNote().trim(),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.refunding.set(null);
          this.notifications.show('Đã ghi nhận hoàn tiền và lưu nhật ký thao tác.');
          this.loadRefunds();
          this.load();
        },
        error: (error: { error?: { error?: { message?: string } } }) => {
          this.busy.set(false);
          this.refundError.set(
            error?.error?.error?.message ?? 'Không ghi nhận được hoàn tiền, vui lòng thử lại.',
          );
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
    this.reconciliation.set('ALL');
    this.type.set('ALL');
    this.refundStatus.set('ALL');
    this.onlyPending.set(false);
    this.page.set(1);
    this.load();
  }

  openResolve(item: PaymentException): void {
    this.resolving.set(item);
    this.action.set('MARK_PAID');
    this.note.set('');
    this.resolveError.set('');
  }

  submitResolve(): void {
    if (!this.note().trim()) {
      this.resolveError.set('Vui lòng ghi chú xử lý để lưu nhật ký.');
      return;
    }
    this.resolveError.set('');
    this.confirmOpen.set(true);
  }

  commitResolve(): void {
    const item = this.resolving();
    if (!item) return;
    this.busy.set(true);
    this.api
      .resolve(item.transaction.id, {
        orderId: item.transaction.orderId ?? undefined,
        action: this.action(),
        note: this.note().trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.confirmOpen.set(false);
          this.resolving.set(null);
          this.notifications.show('Đã xử lý đối soát và ghi nhật ký thao tác.');
          this.loadExceptions();
          this.load();
        },
        error: () => {
          this.busy.set(false);
          this.notifications.show('Không xử lý được giao dịch, vui lòng thử lại.', 'error');
        },
      });
  }

  exportCsv(): void {
    if (this.exporting()) return;

    const query = {
      q: this.keyword() || undefined,
      reconciliationStatus: this.reconciliation() as never,
      type: this.type() as never,
      status: this.refundStatus() as never,
    };
    this.exporting.set(true);
    loadAllPages((page, limit) => this.api.list({ ...query, page, limit }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transactions) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `doi-soat-thanh-toan-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Mã giao dịch', value: (item) => item.bankTransactionCode },
              { label: 'Mã đơn', value: (item) => item.orderCode },
              { label: 'Khách hàng', value: (item) => item.customerName },
              { label: 'Loại giao dịch', value: (item) => TRANSACTION_TYPE_LABEL[item.type] },
              { label: 'Số tiền', value: (item) => item.amount },
              { label: 'Nguồn dữ liệu', value: (item) => RECORD_SOURCE_LABEL[item.recordSource] },
              {
                label: 'Trạng thái đối soát',
                value: (item) => RECONCILIATION_LABEL[item.reconciliationStatus],
              },
              { label: 'Trạng thái hoàn tiền', value: (item) => REFUND_STATUS_LABEL[item.status] },
              { label: 'Nội dung nhận', value: (item) => item.receivedContent },
              { label: 'Thời điểm giao dịch', value: (item) => item.transactionAt },
              { label: 'Ghi chú', value: (item) => item.note },
            ],
            transactions,
          );
          this.notifications.show(
            downloaded
              ? `Đã tải xuống ${transactions.length} giao dịch.`
              : 'Không có giao dịch phù hợp để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được dữ liệu đối soát để xuất file.', 'error');
        },
      });
  }

  labelOf(value: string): string {
    return RECONCILIATION_LABEL[value as keyof typeof RECONCILIATION_LABEL] ?? value;
  }

  toneOf(value: string): string {
    return (
      RECONCILIATION_STATUS_TONE?.[value as keyof typeof RECONCILIATION_STATUS_TONE] ?? 'neutral'
    );
  }

  sourceLabel(source: string): string {
    return RECORD_SOURCE_LABEL[source as keyof typeof RECORD_SOURCE_LABEL] ?? source;
  }

  typeLabel(item: PaymentTransaction): string {
    return TRANSACTION_TYPE_LABEL[item.type];
  }

  refundSourceLabel(item: PaymentTransaction): string {
    return item.refundSource ? REFUND_SOURCE_LABEL[item.refundSource] : 'Hoàn tiền';
  }

  destinationLabel(item: PaymentTransaction): string {
    return item.refundTo ? REFUND_DESTINATION_LABEL[item.refundTo] : '—';
  }

  private nowLocal(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }

  refundLabel(item: PaymentTransaction): string {
    return REFUND_STATUS_LABEL[item.status];
  }
}
