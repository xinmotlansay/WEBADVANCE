import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  RECONCILIATION_LABEL,
  RECORD_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  RESOLVE_ACTION_LABEL,
  RECONCILIATION_STATUS_TONE,
  TRANSACTION_TYPE_LABEL,
  type PaymentException,
  type PaymentTransaction,
  type ResolveAction,
} from 'shared';
import { AdminPaymentApi } from '../../core/api/admin-payment.api';
import { loadAllPages } from '../../core/api/load-all-pages';
import { downloadCsv } from '../../core/format/csv-export';
import { DateVnPipe, OrderCodePipe, ShortVndPipe, VndPipe } from '../../core/format/format.pipes';
import { NotificationService } from '../../core/ui/notification.service';
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

      <section class="cv-panel" style="margin-bottom: 20px" aria-labelledby="exceptions-title">
        <div class="cv-panel__head">
          <h2 class="cv-panel__title" id="exceptions-title">Hàng đợi ngoại lệ QR</h2>
          <span class="cv-tag">{{ exceptions().length }} giao dịch</span>
        </div>

        @if (exceptionLoading()) {
          <app-table-skeleton [rows]="[1, 2, 3]" />
        } @else if (exceptions().length === 0) {
          <p class="cv-small cv-muted">Không còn giao dịch nào cần đối soát thủ công.</p>
        } @else {
          <div class="exception-grid">
            @for (item of exceptions(); track item.transaction.id) {
              <article class="exception">
                <div class="cv-spread">
                  <span class="cv-badge" [class]="'cv-badge cv-badge--' + toneOf(item.reason)">
                    {{ labelOf(item.reason) }}
                  </span>
                  <span class="cv-small cv-muted">{{
                    item.transaction.transactionAt | dateVn: 'datetime'
                  }}</span>
                </div>
                <p class="exception__code">
                  {{ item.transaction.bankTransactionCode }}
                  <span class="cv-muted">· {{ item.transaction.receivedContent }}</span>
                </p>
                <dl class="cv-kv exception__kv">
                  <dt>Cần thu</dt>
                  <dd class="cv-num">{{ item.expectedAmount | vnd }}</dd>
                  <dt>Đã nhận</dt>
                  <dd class="cv-num">{{ item.receivedAmount | vnd }}</dd>
                  <dt>Chênh lệch</dt>
                  <dd
                    class="cv-num"
                    [style.color]="
                      item.receivedAmount - item.expectedAmount < 0
                        ? 'var(--cv-down)'
                        : 'var(--cv-up)'
                    "
                  >
                    {{ item.receivedAmount - item.expectedAmount | vnd }}
                  </dd>
                  @if (item.transferContent) {
                    <dt>Nội dung đúng</dt>
                    <dd>{{ item.transferContent }}</dd>
                  }
                </dl>
                <button
                  type="button"
                  class="cv-btn cv-btn--secondary cv-btn--block"
                  (click)="openResolve(item)"
                >
                  <app-icon name="wallet" size="sm" />
                  Xử lý đối soát
                </button>
              </article>
            }
          </div>
        }
      </section>

      <div class="cv-filter-row">
        <app-filter-chip
          label="Đối soát"
          [options]="reconciliationOptions"
          [value]="reconciliation()"
          (valueChange)="reconciliation.set($event); page.set(1); load()"
        />
        @if (keyword() || reconciliation() !== 'ALL') {
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
      } @else if (transactions().length === 0) {
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
                  <th scope="col">Nguồn</th>
                  <th scope="col">Thời điểm</th>
                </tr>
              </thead>
              <tbody>
                @for (item of transactions(); track item.id) {
                  <tr>
                    <td>
                      <span class="cv-num">{{ item.bankTransactionCode }}</span>
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
                    <td>{{ sourceLabel(item.recordSource) }}</td>
                    <td class="cv-nowrap">{{ item.transactionAt | dateVn: 'datetime' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination [meta]="meta()" (pageChange)="page.set($event); load()" />
        </div>
      }
    </div>

    <aside class="cv-rail" aria-label="Tổng quan thanh toán">
      <div class="cv-rail__hero">
        <p class="cv-label">Tổng thu trên trang</p>
        <p class="cv-hero-num">{{ pageTotal() | shortVnd }}</p>
        <p class="cv-small cv-muted">{{ transactions().length }} giao dịch</p>
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
          <li>Hoàn tiền cần thông tin tài khoản nhận của khách.</li>
          <li>Chênh lệch thiếu/thừa phải xử lý trước khi đóng ca.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Doanh thu ghi nhận</p>
        <p class="cv-sub-num">{{ pageTotal() | vnd }}</p>
        <p class="cv-small cv-muted">Không gồm giao dịch đang chờ xử lý.</p>
      </div>
    </aside>

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
      .exception-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }

      .exception {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
      }

      .exception__code {
        font-size: var(--cv-text-small);
        font-weight: 600;
      }

      .exception__kv {
        grid-template-columns: 90px 1fr;
        gap: 4px 8px;
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
export class PaymentsScreenComponent {
  private readonly api = inject(AdminPaymentApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reconciliationOptions = RECONCILIATION_OPTIONS;
  readonly resolveOptions = RESOLVE_OPTIONS;

  readonly keyword = signal('');
  readonly reconciliation = signal('ALL');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly transactions = signal<PaymentTransaction[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  readonly exceptions = signal<PaymentException[]>([]);
  readonly exceptionLoading = signal(true);

  readonly resolving = signal<PaymentException | null>(null);
  readonly action = signal<ResolveAction>('MARK_PAID');
  readonly note = signal('');
  readonly resolveError = signal('');
  readonly confirmOpen = signal(false);
  readonly busy = signal(false);

  readonly pageTotal = computed(() =>
    this.transactions().reduce((sum, item) => sum + item.amount, 0),
  );

  readonly confirmMessage = computed(() => {
    const item = this.resolving();
    if (!item) return '';
    return `Giao dịch ${item.transaction.bankTransactionCode} sẽ được xử lý theo cách "${RESOLVE_ACTION_LABEL[this.action()]}". Thao tác được ghi nhật ký và không thể hoàn tác.`;
  });

  constructor() {
    this.load();
    this.loadExceptions();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        q: this.keyword() || undefined,
        reconciliationStatus: this.reconciliation() as never,
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

  onSearch(value: string): void {
    this.keyword.set(value);
    this.page.set(1);
    this.load();
  }

  resetFilters(): void {
    this.keyword.set('');
    this.reconciliation.set('ALL');
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

  refundLabel(item: PaymentTransaction): string {
    return REFUND_STATUS_LABEL[item.status];
  }
}
