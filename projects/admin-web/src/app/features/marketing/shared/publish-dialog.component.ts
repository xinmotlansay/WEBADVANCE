import { ChangeDetectionStrategy, Component, HostListener, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MIN_LEAD_MS } from '../../../services/marketing/schedule.service';

export interface PublishSubject {
  /** Loại nội dung, ví dụ "Collection". */
  kind: string;
  name: string;
  thumbnail?: string | null;
  /** Dòng phụ dưới tên (ví dụ nội dung thanh thông báo). */
  note?: string;
}
export interface PublishChoice {
  /** Trống = đăng ngay. */
  publishAt?: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Hộp thoại đăng cho đúng một mục: nêu rõ đăng cái gì, chọn đăng ngay hay lên lịch (giống Meta Business Suite).
 * Không có nút đăng chung ở góc trang; mỗi mục tự mở hộp thoại này.
 */
@Component({
  selector: 'app-publish-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pd-backdrop" (click)="cancelled.emit()">
      <div class="pd" role="dialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
        <h2>{{ title() }}</h2>

        <div class="pd-subject">
          @if (subject().thumbnail) {
            <img [src]="subject().thumbnail" alt="" />
          }
          <div>
            <span class="pd-kind">{{ subject().kind }}</span>
            <strong>{{ subject().name }}</strong>
            @if (subject().note) {
              <small>{{ subject().note }}</small>
            }
          </div>
        </div>

        @if (!rescheduleOnly()) {
          <fieldset class="pd-modes">
            <legend class="cv-section-label">Thời điểm đăng</legend>
            <label class="pd-mode" [class.pd-mode--on]="mode() === 'NOW'">
              <input type="radio" name="pd-mode" value="NOW" [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
              <span><strong>Đăng ngay</strong><small>Khách thấy ngay sau khi xác nhận.</small></span>
            </label>
            <label class="pd-mode" [class.pd-mode--on]="mode() === 'LATER'">
              <input type="radio" name="pd-mode" value="LATER" [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
              <span><strong>Lên lịch</strong><small>Tự đăng đúng giờ đã chọn, sau hiện tại ít nhất 5 phút.</small></span>
            </label>
          </fieldset>
        }

        @if (mode() === 'LATER') {
          <div class="cv-field">
            <label for="pd-at">Giờ đăng</label>
            <input id="pd-at" class="cv-input" type="datetime-local" [min]="minInput()" [ngModel]="at()" (ngModelChange)="at.set($event)" />
          </div>
        }
        @if (error()) {
          <p class="cv-alert" role="alert">{{ error() }}</p>
        }

        <div class="pd-foot">
          <button type="button" class="cv-btn" (click)="cancelled.emit()">Hủy</button>
          <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="submit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .pd-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgb(11 48 86 / 0.45); }
    .pd { width: min(480px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 24px; border-radius: 14px; background: var(--cv-surface); box-shadow: 0 16px 48px rgb(0 0 0 / 0.25); display: grid; gap: 16px; }
    h2 { margin: 0; font-size: 18px; }
    .pd-subject { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--cv-border); border-radius: 10px; background: var(--cv-surface-alt); }
    .pd-subject img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; flex: none; }
    .pd-subject div { display: grid; gap: 2px; min-width: 0; }
    .pd-subject strong { overflow-wrap: anywhere; }
    .pd-subject small { color: var(--cv-muted); }
    .pd-kind { color: var(--cv-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pd-modes { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
    .pd-mode { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--cv-border); border-radius: 10px; cursor: pointer; }
    .pd-mode--on { border-color: var(--cv-navy); background: var(--cv-row-selected); }
    .pd-mode span { display: grid; gap: 2px; }
    .pd-mode small { color: var(--cv-muted); }
    .pd-foot { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class PublishDialogComponent {
  readonly subject = input.required<PublishSubject>();
  /** Chỉ chọn giờ mới (đổi lịch), không có lựa chọn đăng ngay. */
  readonly rescheduleOnly = input(false);
  readonly busy = input(false);
  /** Lỗi từ server hiển thị trong hộp thoại. */
  readonly serverError = input('');
  readonly confirmed = output<PublishChoice>();
  readonly cancelled = output<void>();

  protected readonly mode = signal<'NOW' | 'LATER'>('NOW');
  protected readonly at = signal(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  private readonly localError = signal('');

  protected readonly error = computed(() => this.localError() || this.serverError());
  protected readonly title = computed(() => (this.rescheduleOnly() ? 'Đổi giờ đăng' : 'Đăng nội dung'));
  protected readonly confirmLabel = computed(() => {
    if (this.busy()) return 'Đang xử lý…';
    if (this.rescheduleOnly()) return 'Lưu giờ mới';
    return this.mode() === 'NOW' ? `Đăng “${this.subject().name}”` : 'Lên lịch đăng';
  });

  constructor() {
    // Đổi lịch thì luôn ở chế độ chọn giờ.
    queueMicrotask(() => {
      if (this.rescheduleOnly()) this.mode.set('LATER');
    });
  }

  protected minInput(): string {
    return toLocalInput(new Date(Date.now() + MIN_LEAD_MS));
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cancelled.emit();
  }

  protected submit(): void {
    this.localError.set('');
    if (this.mode() === 'NOW') return this.confirmed.emit({});
    const at = new Date(this.at());
    if (Number.isNaN(at.getTime())) return this.localError.set('Chọn giờ đăng.');
    if (at.getTime() < Date.now() + MIN_LEAD_MS) return this.localError.set('Giờ đăng phải sau hiện tại ít nhất 5 phút.');
    this.confirmed.emit({ publishAt: at });
  }
}
