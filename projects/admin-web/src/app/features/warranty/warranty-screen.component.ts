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
  WARRANTY_INSPECTION_LABEL,
  WARRANTY_RESOLUTION_LABEL,
  WARRANTY_STATUS_LABEL,
  WarrantyInspectionResult,
  WarrantyResolution,
  WarrantyStatus,
  type WarrantyRequest,
} from 'shared';
import { AdminWarrantyApi } from '../../core/api/admin-warranty.api';
import { loadAllPages } from '../../core/api/load-all-pages';
import { DateVnPipe, OrderCodePipe } from '../../core/format/format.pipes';
import { downloadCsv } from '../../core/format/csv-export';
import { NotificationService } from '../../core/ui/notification.service';
import { parseApiError } from '../../core/auth/auth-error';
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
  ...Object.entries(WARRANTY_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

const INSPECTION_OPTIONS = Object.entries(WARRANTY_INSPECTION_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const RESOLUTION_OPTIONS = Object.entries(WARRANTY_RESOLUTION_LABEL).map(([value, label]) => ({
  value,
  label,
}));

@Component({
  selector: 'app-warranty-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    FilterChipComponent,
    StatusBadgeComponent,
    PaginationComponent,
    DetailPopupComponent,
    ReasonDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    OrderCodePipe,
    DateVnPipe,
  ],
  template: `
    <div class="cv-page">
      <app-page-header
        title="Bảo hành"
        subtitle="Tiếp nhận, kiểm tra và xử lý yêu cầu bảo hành theo thời hạn sản phẩm."
        searchId="warranty-search"
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
        @if (keyword() || status() !== 'ALL') {
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
          icon="shield-check"
          title="Không có yêu cầu bảo hành"
          message="Thử đổi bộ lọc hoặc từ khóa tìm kiếm khác."
          actionLabel="Xóa bộ lọc"
          (action)="resetFilters()"
        />
      } @else {
        <div class="cv-table-wrap">
          <div class="cv-table-scroll">
            <table class="cv-table">
              <caption class="sr-only">
                Danh sách yêu cầu bảo hành
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã phiếu</th>
                  <th scope="col">Sản phẩm</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Ngày mua</th>
                  <th scope="col">Hết hạn</th>
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
                    <td>
                      <span class="cv-table__customer">{{ item.productName }}</span>
                      <div class="cv-small cv-muted">SKU {{ item.sku }}</div>
                    </td>
                    <td>
                      <span class="cv-table__customer">
                        <span class="cv-avatar" aria-hidden="true">{{
                          initials(item.customerName)
                        }}</span>
                        {{ item.customerName }}
                      </span>
                    </td>
                    <td class="cv-nowrap">{{ item.purchasedAt | dateVn }}</td>
                    <td class="cv-nowrap">{{ item.expiresAt | dateVn }}</td>
                    <td><app-status-badge kind="warranty" [value]="item.status" /></td>
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

    <aside class="cv-rail" aria-label="Tổng quan bảo hành">
      <div class="cv-rail__hero">
        <p class="cv-label">Chờ xác nhận</p>
        <p class="cv-hero-num">{{ pendingCount() }}</p>
        <p class="cv-small cv-muted">{{ items().length }} phiếu trên trang</p>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 12px">Theo trạng thái</p>
        <ul class="status-list">
          @for (entry of statusCounts(); track entry.status) {
            <li class="status-item">
              <app-status-badge kind="warranty" [value]="entry.status" />
              <span class="cv-num cv-small">{{ entry.count }}</span>
            </li>
          }
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Quy trình bảo hành</p>
        <ul class="rule-list cv-small cv-muted">
          <li>Tiếp nhận và xác nhận thời hạn bảo hành.</li>
          <li>Kiểm tra tại nhà hoặc nhận sản phẩm về kho.</li>
          <li>Kết luận: sửa chữa, thay linh kiện, đổi sản phẩm.</li>
          <li>Ngoài phạm vi phải từ chối kèm lý do rõ ràng.</li>
          <li>Mọi bước đều lưu vào lịch sử của phiếu.</li>
        </ul>
      </div>
      <div class="cv-rail__block">
        <p class="cv-label" style="margin-bottom: 8px">Đang xử lý</p>
        <p class="cv-sub-num">{{ processingCount() }}</p>
        <p class="cv-small cv-muted">Phiếu đã tiếp nhận và đang kiểm tra / sửa chữa.</p>
      </div>
    </aside>

    @if (active(); as item) {
      <app-detail-popup
        [open]="active() !== null"
        [title]="active() ? 'Bảo hành ' + active()!.code : 'Chi tiết bảo hành'"
        (closed)="active.set(null)"
      >
        <div popupBody class="cv-stack">
          <div class="cv-spread">
            <app-status-badge kind="warranty" [value]="item.status" />
            <span class="cv-small cv-muted">{{ item.productName }}</span>
          </div>

          <dl class="cv-kv">
            <dt>Đơn gốc</dt>
            <dd>{{ item.orderCode | orderCode }}</dd>
            <dt>Khách hàng</dt>
            <dd>{{ item.customerName }} · {{ item.customerPhone }}</dd>
            <dt>Ngày mua</dt>
            <dd>{{ item.purchasedAt | dateVn }}</dd>
            <dt>Bảo hành</dt>
            <dd>{{ item.warrantyMonths }} tháng · hết hạn {{ item.expiresAt | dateVn }}</dd>
            <dt>Tình trạng</dt>
            <dd>{{ item.condition }}</dd>
            <dt>Lý do</dt>
            <dd>{{ item.reason }}</dd>
            <dt>Lịch tại nhà</dt>
            <dd>
              {{
                item.homeServiceSchedule
                  ? (item.homeServiceSchedule | dateVn: 'datetime')
                  : 'Chưa đặt'
              }}
            </dd>
            <dt>Mã vận đơn</dt>
            <dd>{{ item.trackingCode || '—' }}</dd>
            <dt>Kết quả kiểm tra</dt>
            <dd>
              {{ item.inspectionResult ? inspectionLabel(item.inspectionResult) : 'Chưa có' }}
            </dd>
            <dt>Hướng xử lý</dt>
            <dd>{{ item.resolution ? resolutionLabel(item.resolution) : 'Chưa có' }}</dd>
          </dl>

          @if (item.dataIntegrityWarning) {
            <div class="cv-error" role="alert">{{ item.dataIntegrityWarning }}</div>
          }

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Minh chứng</p>
            @if (item.evidence.length) {
              <div class="evidence-row">
                @for (image of item.evidence; track image) {
                  <span class="evidence" [attr.aria-label]="'Minh chứng ' + image"
                    ><app-icon name="image" size="sm"
                  /></span>
                }
              </div>
            } @else {
              <p class="cv-small cv-muted">Khách chưa gửi ảnh minh chứng.</p>
            }
          </section>

          @if (item.rejectReason) {
            <div class="cv-error" role="alert">Lý do từ chối: {{ item.rejectReason }}</div>
          }

          @if (canUpdate(item) && !item.dataIntegrityWarning) {
            <div class="cv-field">
              <label class="cv-field__label" for="warranty-inspection">Kết quả kiểm tra</label>
              <select
                class="cv-select"
                id="warranty-inspection"
                [value]="inspection()"
                (change)="inspection.set($any($event.target).value)"
              >
                @for (option of inspectionOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="warranty-resolution">Hướng xử lý</label>
              <select
                class="cv-select"
                id="warranty-resolution"
                [value]="resolution()"
                (change)="resolution.set($any($event.target).value)"
              >
                @for (option of resolutionOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="warranty-schedule">Lịch tại nhà</label>
              <input
                class="cv-input"
                id="warranty-schedule"
                type="datetime-local"
                [value]="schedule()"
                (input)="schedule.set($any($event.target).value)"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="warranty-tracking"
                >Mã vận đơn (nếu gửi về kho)</label
              >
              <input
                class="cv-input"
                id="warranty-tracking"
                [value]="tracking()"
                (input)="tracking.set($any($event.target).value)"
              />
            </div>
            <div class="cv-field">
              <label class="cv-field__label" for="warranty-note">Ghi chú xử lý</label>
              <textarea
                class="cv-textarea"
                id="warranty-note"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
                placeholder="Ví dụ: đã thay 4 bản lề, hẹn hoàn tất trong 3 ngày"
              ></textarea>
            </div>
          }

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Lịch sử phiếu</p>
            <ol class="timeline">
              @for (entry of item.history; track entry.at) {
                <li class="timeline__item">
                  <span class="timeline__dot" aria-hidden="true"></span>
                  <div>
                    <p class="cv-small" style="font-weight: 600">{{ statusLabel(entry.status) }}</p>
                    <p class="cv-small cv-muted">{{ entry.at | dateVn: 'datetime' }}</p>
                    @if (entry.note) {
                      <p class="cv-small">{{ entry.note }}</p>
                    }
                  </div>
                </li>
              }
            </ol>
          </section>

          @if (activeError()) {
            <div class="cv-error" role="alert">{{ activeError() }}</div>
          }
        </div>
        <div popupFooter>
          @if (item.status === WarrantyStatus.PENDING_CONFIRMATION) {
            <button
              type="button"
              class="cv-btn cv-btn--danger"
              [disabled]="busy() || !!item.dataIntegrityWarning"
              (click)="rejecting.set(item)"
            >
              Từ chối
            </button>
            <button
              type="button"
              class="cv-btn cv-btn--accent"
              [disabled]="busy() || !!item.dataIntegrityWarning"
              (click)="accept(item)"
            >
              Tiếp nhận
            </button>
          }
          @if (canUpdate(item) && !item.dataIntegrityWarning) {
            <button
              type="button"
              class="cv-btn cv-btn--primary"
              [disabled]="busy()"
              (click)="save(item)"
            >
              Lưu cập nhật
            </button>
          }
          @if (
            item.status === WarrantyStatus.COMPLETED || item.status === WarrantyStatus.REJECTED
          ) {
            <button type="button" class="cv-btn cv-btn--secondary" (click)="active.set(null)">
              Đóng
            </button>
          }
        </div>
      </app-detail-popup>
    }

    <app-reason-dialog
      [open]="rejecting() !== null"
      title="Từ chối yêu cầu bảo hành"
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

      .evidence-row {
        display: flex;
        gap: 6px;
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
export class WarrantyScreenComponent {
  private readonly api = inject(AdminWarrantyApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly WarrantyStatus = WarrantyStatus;
  readonly statusOptions = STATUS_OPTIONS;
  readonly inspectionOptions = INSPECTION_OPTIONS;
  readonly resolutionOptions = RESOLUTION_OPTIONS;

  readonly keyword = signal('');
  readonly status = signal('ALL');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly items = signal<WarrantyRequest[]>([]);
  readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });

  readonly active = signal<WarrantyRequest | null>(null);
  readonly rejecting = signal<WarrantyRequest | null>(null);
  readonly busy = signal(false);
  readonly activeError = signal('');

  readonly inspection = signal<WarrantyInspectionResult>(WarrantyInspectionResult.UNDER_REPAIR);
  readonly resolution = signal<WarrantyResolution>(WarrantyResolution.REPAIRED);
  readonly schedule = signal('');
  readonly tracking = signal('');
  readonly note = signal('');

  readonly pendingCount = computed(
    () => this.items().filter((item) => item.status === WarrantyStatus.PENDING_CONFIRMATION).length,
  );
  readonly processingCount = computed(
    () =>
      this.items().filter((item) =>
        [WarrantyStatus.RECEIVED, WarrantyStatus.INSPECTING, WarrantyStatus.IN_WARRANTY].includes(
          item.status,
        ),
      ).length,
  );
  readonly statusCounts = computed(() =>
    Object.values(WarrantyStatus).map((status) => ({
      status,
      count: this.items().filter((item) => item.status === status).length,
    })),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        q: this.keyword() || undefined,
        status: this.status() as WarrantyStatus | 'ALL',
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
          this.error.set('Không tải được danh sách bảo hành. Vui lòng thử lại.');
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
    this.page.set(1);
    this.load();
  }

  exportCsv(): void {
    if (this.exporting()) return;

    const query = {
      q: this.keyword() || undefined,
      status: this.status() as WarrantyStatus | 'ALL',
    };
    this.exporting.set(true);
    loadAllPages((page, limit) => this.api.list({ ...query, page, limit }))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (requests) => {
          this.exporting.set(false);
          const downloaded = downloadCsv(
            `yeu-cau-bao-hanh-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { label: 'Mã phiếu', value: (item) => item.code },
              { label: 'Mã đơn', value: (item) => item.orderCode },
              { label: 'Khách hàng', value: (item) => item.customerName },
              { label: 'Số điện thoại', value: (item) => item.customerPhone },
              { label: 'Sản phẩm', value: (item) => item.productName },
              { label: 'SKU', value: (item) => item.sku },
              { label: 'Trạng thái', value: (item) => WARRANTY_STATUS_LABEL[item.status] },
              { label: 'Ngày mua', value: (item) => item.purchasedAt },
              { label: 'Thời hạn bảo hành (tháng)', value: (item) => item.warrantyMonths },
              { label: 'Ngày hết hạn', value: (item) => item.expiresAt },
              { label: 'Lý do', value: (item) => item.reason },
              { label: 'Kết quả kiểm tra', value: (item) => item.inspectionResult },
              { label: 'Hướng xử lý', value: (item) => item.resolution },
            ],
            requests,
          );
          this.notifications.show(
            downloaded
              ? `Đã tải xuống ${requests.length} yêu cầu bảo hành.`
              : 'Không có yêu cầu bảo hành phù hợp để xuất.',
            downloaded ? 'info' : 'error',
          );
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.show('Không tải được danh sách bảo hành để xuất file.', 'error');
        },
      });
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  statusLabel(status: WarrantyStatus): string {
    return WARRANTY_STATUS_LABEL[status];
  }

  inspectionLabel(value: WarrantyInspectionResult): string {
    return WARRANTY_INSPECTION_LABEL[value];
  }

  resolutionLabel(value: WarrantyResolution): string {
    return WARRANTY_RESOLUTION_LABEL[value];
  }

  canUpdate(item: WarrantyRequest): boolean {
    return [
      WarrantyStatus.RECEIVED,
      WarrantyStatus.INSPECTING,
      WarrantyStatus.IN_WARRANTY,
    ].includes(item.status);
  }

  open(item: WarrantyRequest): void {
    this.active.set(item);
    this.activeError.set('');
    this.inspection.set(item.inspectionResult ?? WarrantyInspectionResult.UNDER_REPAIR);
    this.resolution.set(item.resolution ?? WarrantyResolution.REPAIRED);
    this.schedule.set(item.homeServiceSchedule ? item.homeServiceSchedule.slice(0, 16) : '');
    this.tracking.set(item.trackingCode ?? '');
    this.note.set('');
  }

  accept(item: WarrantyRequest): void {
    this.busy.set(true);
    this.api
      .accept(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.patch(updated);
          this.notifications.show(`Đã tiếp nhận phiếu ${updated.code}.`);
        },
        error: () => {
          this.busy.set(false);
          this.notifications.show('Không tiếp nhận được phiếu.', 'error');
        },
      });
  }

  save(item: WarrantyRequest): void {
    if (
      item.status === WarrantyStatus.IN_WARRANTY &&
      this.resolution() === WarrantyResolution.NOT_ELIGIBLE
    ) {
      this.activeError.set(
        'Phiếu đã được xác nhận trong phạm vi bảo hành, không thể chuyển sang từ chối.',
      );
      return;
    }

    const nextStatus =
      item.status === WarrantyStatus.IN_WARRANTY
        ? WarrantyStatus.IN_WARRANTY
        : item.status === WarrantyStatus.RECEIVED
          ? WarrantyStatus.INSPECTING
          : this.resolution() === WarrantyResolution.NOT_ELIGIBLE
            ? WarrantyStatus.REJECTED
            : WarrantyStatus.IN_WARRANTY;

    this.busy.set(true);
    this.api
      .updateStatus(item.id, {
        status: nextStatus,
        inspectionResult: this.inspection(),
        resolution: this.resolution(),
        homeServiceSchedule: this.schedule() ? new Date(this.schedule()).toISOString() : null,
        trackingCode: this.tracking().trim() || null,
        note: this.note().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
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

  private patch(updated: WarrantyRequest): void {
    this.items.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    if (this.active()?.id === updated.id) this.active.set(updated);
  }
}
