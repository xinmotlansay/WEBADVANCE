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
  type UpdateWarrantyStatusRequest,
  type WarrantyRequest,
} from 'shared';
import { AdminWarrantyApi } from '../../core/api/admin-warranty.api';
import { loadAllPages } from '../../core/api/load-all-pages';
import { DateVnPipe, OrderCodePipe } from '../../core/format/format.pipes';
import { downloadCsv } from '../../core/format/csv-export';
import { AdminSocketService } from '../../core/socket/admin-socket.service';
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

const STEPS: Array<{ status: WarrantyStatus; label: string }> = [
  { status: WarrantyStatus.PENDING_CONFIRMATION, label: 'Chờ xác nhận' },
  { status: WarrantyStatus.RECEIVED, label: 'Đã tiếp nhận' },
  { status: WarrantyStatus.INSPECTING, label: 'Đang kiểm tra' },
  { status: WarrantyStatus.IN_WARRANTY, label: 'Đang bảo hành' },
  { status: WarrantyStatus.COMPLETED, label: 'Hoàn tất' },
];

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

          @if (item.status === WarrantyStatus.REJECTED) {
            <div class="cv-error" role="alert">
              Đã từ chối{{ item.rejectReason ? ': ' + item.rejectReason : '' }}
            </div>
          } @else {
            <ol class="steps" aria-label="Tiến trình bảo hành">
              @for (step of steps; track step.status; let i = $index) {
                <li
                  class="steps__item"
                  [class.steps__item--done]="stepIndex(item) > i"
                  [class.steps__item--current]="stepIndex(item) === i"
                  [attr.aria-current]="stepIndex(item) === i ? 'step' : null"
                >
                  <span class="steps__dot" aria-hidden="true">{{ stepIndex(item) > i ? '✓' : i + 1 }}</span>
                  <span class="steps__label">{{ step.label }}</span>
                </li>
              }
            </ol>
          }

          <dl class="cv-kv">
            <dt>Đơn gốc</dt>
            <dd>{{ item.orderCode | orderCode }}</dd>
            <dt>Khách hàng</dt>
            <dd>{{ item.customerName }} · {{ item.customerPhone }}</dd>
            <dt>Ngày mua</dt>
            <dd>{{ item.purchasedAt | dateVn }}</dd>
            <dt>Bảo hành</dt>
            <dd>{{ item.warrantyMonths }} tháng · hết hạn {{ item.expiresAt | dateVn }}</dd>
            @if (item.condition) {
              <dt>Tình trạng</dt>
              <dd>{{ item.condition }}</dd>
            }
            <dt>Lỗi khách báo</dt>
            <dd>{{ item.reason }}</dd>
          </dl>

          @if (item.dataIntegrityWarning) {
            <div class="cv-error" role="alert">{{ item.dataIntegrityWarning }}</div>
          }

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Minh chứng của khách</p>
            @if (item.evidence.length) {
              <div class="evidence-grid">
                @for (file of item.evidence; track file) {
                  <a class="evidence" [href]="file" target="_blank" rel="noopener" [attr.aria-label]="'Mở minh chứng ' + (\$index + 1)">
                    @if (isVideo(file)) {
                      <video [src]="file" preload="metadata" muted></video>
                      <span class="evidence__badge">Video</span>
                    } @else {
                      <img [src]="file" alt="Minh chứng bảo hành" loading="lazy" />
                    }
                  </a>
                }
              </div>
              <p class="cv-small cv-muted" style="margin-top: 6px">Bấm vào ảnh để xem kích thước đầy đủ.</p>
            } @else {
              <p class="cv-small cv-muted">Khách chưa gửi ảnh hoặc video minh chứng.</p>
            }
          </section>

          @if (!item.dataIntegrityWarning) {
            @switch (item.status) {
              @case (WarrantyStatus.PENDING_CONFIRMATION) {
                <p class="hint">
                  Xem ảnh minh chứng và thời hạn bảo hành, rồi chọn <strong>Tiếp nhận</strong> hoặc
                  <strong>Từ chối</strong> kèm lý do.
                </p>
              }
              @case (WarrantyStatus.RECEIVED) {
                <section class="cv-popup__section stage">
                  <p class="cv-label">Bước tiếp theo: kiểm tra sản phẩm</p>
                  <div class="seg" role="radiogroup" aria-label="Hình thức kiểm tra">
                    <button type="button" role="radio" class="seg__btn" [class.seg__btn--on]="method() === 'HOME'" [attr.aria-checked]="method() === 'HOME'" (click)="method.set('HOME')">Kiểm tra tại nhà</button>
                    <button type="button" role="radio" class="seg__btn" [class.seg__btn--on]="method() === 'WAREHOUSE'" [attr.aria-checked]="method() === 'WAREHOUSE'" (click)="method.set('WAREHOUSE')">Nhận về kho</button>
                  </div>
                  @if (method() === 'HOME') {
                    <div class="cv-field">
                      <label class="cv-field__label" for="warranty-schedule">Lịch hẹn tại nhà</label>
                      <input class="cv-input" id="warranty-schedule" type="datetime-local" [value]="schedule()" (input)="schedule.set($any($event.target).value)" />
                    </div>
                  } @else {
                    <div class="cv-field">
                      <label class="cv-field__label" for="warranty-tracking">Mã vận đơn gửi về kho</label>
                      <div class="inline">
                        <input class="cv-input" id="warranty-tracking" [value]="tracking()" (input)="tracking.set($any($event.target).value)" placeholder="Nhập mã hoặc tạo tự động" />
                        <button type="button" class="cv-btn cv-btn--secondary" (click)="tracking.set(generateTracking(item))">Tạo mã</button>
                      </div>
                    </div>
                  }
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-note">Ghi chú (không bắt buộc)</label>
                    <textarea class="cv-textarea" id="warranty-note" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ví dụ: hẹn khách 9h sáng, mang theo bản lề dự phòng"></textarea>
                  </div>
                </section>
              }
              @case (WarrantyStatus.INSPECTING) {
                <section class="cv-popup__section stage">
                  <p class="cv-label">Ghi nhận kết quả kiểm tra</p>
                  <dl class="cv-kv">
                    <dt>Hình thức</dt>
                    <dd>
                      @if (item.homeServiceSchedule) {
                        Tại nhà · {{ item.homeServiceSchedule | dateVn: 'datetime' }}
                      } @else if (item.trackingCode) {
                        Nhận về kho · mã vận đơn {{ item.trackingCode }}
                      } @else {
                        Chưa ghi nhận
                      }
                    </dd>
                  </dl>
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-inspection">Kết quả kiểm tra</label>
                    <select class="cv-select" id="warranty-inspection" [value]="inspection()" (change)="inspection.set($any($event.target).value)">
                      <option value="">Chọn kết quả…</option>
                      @for (option of inspectionOptions; track option.value) {
                        <option [value]="option.value">{{ option.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-resolution">Hướng xử lý</label>
                    <select class="cv-select" id="warranty-resolution" [value]="resolution()" (change)="resolution.set($any($event.target).value)">
                      <option value="">Chọn hướng xử lý…</option>
                      @for (option of resolutionOptions; track option.value) {
                        <option [value]="option.value">{{ option.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-note">Ghi chú (không bắt buộc)</label>
                    <textarea class="cv-textarea" id="warranty-note" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ví dụ: ghế lỏng chân do ốc bị tuột, cần siết lại"></textarea>
                  </div>
                  <p class="hint">Sản phẩm không thuộc phạm vi bảo hành? Dùng nút <strong>Từ chối, ngoài phạm vi</strong> bên dưới.</p>
                </section>
              }
              @case (WarrantyStatus.IN_WARRANTY) {
                <section class="cv-popup__section stage">
                  <p class="cv-label">Hoàn tất bảo hành</p>
                  <dl class="cv-kv">
                    <dt>Kết quả kiểm tra</dt>
                    <dd>{{ item.inspectionResult ? inspectionLabel(item.inspectionResult) : 'Chưa có' }}</dd>
                  </dl>
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-resolution">Kết quả xử lý</label>
                    <select class="cv-select" id="warranty-resolution" [value]="resolution()" (change)="resolution.set($any($event.target).value)">
                      <option value="">Chọn kết quả xử lý…</option>
                      @for (option of resolutionOptions; track option.value) {
                        <option [value]="option.value">{{ option.label }}</option>
                      }
                    </select>
                  </div>
                  <div class="cv-field">
                    <label class="cv-field__label" for="warranty-note">Ghi chú hoàn tất (không bắt buộc)</label>
                    <textarea class="cv-textarea" id="warranty-note" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ví dụ: đã thay 4 bản lề, khách nhận lại hàng ngày 06/11"></textarea>
                  </div>
                </section>
              }
              @default {
                <dl class="cv-kv">
                  <dt>Kết quả kiểm tra</dt>
                  <dd>{{ item.inspectionResult ? inspectionLabel(item.inspectionResult) : '—' }}</dd>
                  <dt>Hướng xử lý</dt>
                  <dd>{{ item.resolution ? resolutionLabel(item.resolution) : '—' }}</dd>
                </dl>
              }
            }
          }

          <section class="cv-popup__section">
            <p class="cv-label" style="margin-bottom: 8px">Lịch sử phiếu</p>
            <ol class="timeline">
              @for (entry of item.history; track entry.at + entry.status) {
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
          @switch (item.status) {
            @case (WarrantyStatus.PENDING_CONFIRMATION) {
              <button type="button" class="cv-btn cv-btn--danger" [disabled]="busy() || !!item.dataIntegrityWarning" (click)="rejecting.set(item)">Từ chối</button>
              <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy() || !!item.dataIntegrityWarning" (click)="accept(item)">Tiếp nhận</button>
            }
            @case (WarrantyStatus.RECEIVED) {
              <button type="button" class="cv-btn cv-btn--danger" [disabled]="busy()" (click)="rejecting.set(item)">Từ chối</button>
              <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="startInspection(item)">Bắt đầu kiểm tra</button>
            }
            @case (WarrantyStatus.INSPECTING) {
              <button type="button" class="cv-btn cv-btn--danger" [disabled]="busy()" (click)="rejecting.set(item)">Từ chối, ngoài phạm vi</button>
              <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="confirmWarranty(item)">Xác nhận bảo hành</button>
            }
            @case (WarrantyStatus.IN_WARRANTY) {
              <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="complete(item)">Hoàn tất bảo hành</button>
            }
            @default {
              <button type="button" class="cv-btn cv-btn--secondary" (click)="active.set(null)">Đóng</button>
            }
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

      .evidence-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .evidence {
        position: relative;
        display: block;
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid var(--cv-border);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
      }

      .evidence img,
      .evidence video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .evidence__badge {
        position: absolute;
        left: 6px;
        bottom: 6px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--cv-navy);
        color: var(--cv-on-navy);
        font-size: 11px;
      }

      .steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 4px;
      }

      .steps__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        font-size: 11px;
        line-height: 1.3;
        color: var(--cv-muted);
      }

      .steps__dot {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid var(--cv-border-strong);
        background: var(--cv-surface);
        font-size: 12px;
        font-weight: 600;
      }

      .steps__item--done .steps__dot {
        border-color: var(--cv-navy);
        background: var(--cv-navy);
        color: var(--cv-on-navy);
      }

      .steps__item--current {
        color: var(--cv-navy);
        font-weight: 600;
      }

      .steps__item--current .steps__dot {
        border-color: var(--cv-navy);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--cv-navy) 15%, transparent);
        color: var(--cv-navy);
      }

      .stage {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .hint {
        margin: 0;
        padding: 10px 12px;
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
        color: var(--cv-muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .seg {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 3px;
        border: 1px solid var(--cv-border-strong);
        border-radius: var(--cv-radius);
        background: var(--cv-surface-alt);
      }

      .seg__btn {
        height: 34px;
        border: 0;
        border-radius: var(--cv-radius-sm);
        background: transparent;
        color: var(--cv-muted);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }

      .seg__btn--on {
        background: var(--cv-surface);
        color: var(--cv-navy);
        font-weight: 600;
        box-shadow: 0 1px 3px color-mix(in srgb, var(--cv-navy) 14%, transparent);
      }

      .inline {
        display: flex;
        gap: 8px;
      }

      .inline .cv-input {
        flex: 1 1 auto;
        min-width: 0;
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
  private readonly socket = inject(AdminSocketService);

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

  readonly steps = STEPS;
  readonly method = signal<'HOME' | 'WAREHOUSE'>('HOME');
  readonly inspection = signal<WarrantyInspectionResult | ''>('');
  readonly resolution = signal<WarrantyResolution | ''>('');
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
    // Khách vừa gửi yêu cầu mới thì làm mới danh sách (khi đang ở trang đầu, không mở khung chi tiết).
    this.socket.connect();
    const off = this.socket.on('warranty:created', () => {
      if (this.page() === 1 && !this.active() && !this.loading()) this.load();
    });
    this.destroyRef.onDestroy(off);
  }

  stepIndex(item: WarrantyRequest): number {
    return STEPS.findIndex((step) => step.status === item.status);
  }

  isVideo(url: string): boolean {
    return /\.(mp4|mov|webm)(\?|$)/i.test(url);
  }

  /** Mã nội bộ để đối chiếu hàng gửi về kho (chưa tích hợp hãng vận chuyển). */
  generateTracking(item: WarrantyRequest): string {
    return `VD-${item.code}`;
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

  open(item: WarrantyRequest): void {
    this.active.set(item);
    this.activeError.set('');
    this.method.set(item.trackingCode && !item.homeServiceSchedule ? 'WAREHOUSE' : 'HOME');
    this.inspection.set(item.inspectionResult ?? '');
    this.resolution.set(item.resolution && item.resolution !== WarrantyResolution.NOT_ELIGIBLE ? item.resolution : '');
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

  /** Đã tiếp nhận → Đang kiểm tra: ghi hình thức kiểm tra (tại nhà hoặc nhận về kho). */
  startInspection(item: WarrantyRequest): void {
    if (this.method() === 'HOME' && !this.schedule()) {
      this.activeError.set('Chọn lịch hẹn kiểm tra tại nhà.');
      return;
    }
    if (this.method() === 'WAREHOUSE' && !this.tracking().trim()) {
      this.activeError.set('Nhập hoặc tạo mã vận đơn gửi về kho.');
      return;
    }
    this.send(item, WarrantyStatus.INSPECTING, {
      homeServiceSchedule: this.method() === 'HOME' ? new Date(this.schedule()).toISOString() : null,
      trackingCode: this.method() === 'WAREHOUSE' ? this.tracking().trim() : null,
    }, `Đã chuyển phiếu ${item.code} sang kiểm tra.`);
  }

  /** Đang kiểm tra → Đang bảo hành: bắt buộc có kết quả kiểm tra và hướng xử lý. */
  confirmWarranty(item: WarrantyRequest): void {
    const inspection = this.inspection();
    const resolution = this.resolution();
    if (!inspection || !resolution) {
      this.activeError.set('Chọn kết quả kiểm tra và hướng xử lý trước khi xác nhận bảo hành.');
      return;
    }
    if (resolution === WarrantyResolution.NOT_ELIGIBLE) {
      this.activeError.set('Không đủ điều kiện thì dùng nút "Từ chối, ngoài phạm vi".');
      return;
    }
    this.send(item, WarrantyStatus.IN_WARRANTY, { inspectionResult: inspection, resolution }, `Phiếu ${item.code} đã vào bảo hành.`);
  }

  /** Đang bảo hành → Hoàn tất: bắt buộc chọn kết quả xử lý. */
  complete(item: WarrantyRequest): void {
    const resolution = this.resolution();
    if (!resolution) {
      this.activeError.set('Chọn kết quả xử lý trước khi hoàn tất.');
      return;
    }
    this.send(item, WarrantyStatus.COMPLETED, { resolution }, `Đã hoàn tất phiếu ${item.code}.`);
  }

  private send(
    item: WarrantyRequest,
    status: WarrantyStatus,
    extra: Partial<UpdateWarrantyStatusRequest>,
    success: string,
  ): void {
    this.activeError.set('');
    this.busy.set(true);
    this.api
      .updateStatus(item.id, { status, ...extra, note: this.note().trim() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.patch(updated);
          this.open(updated);
          this.notifications.show(success);
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
