import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Hộp xác nhận cho thao tác nguy hiểm (admin-ui-rule mục 9): nêu rõ hậu quả, có thể bắt buộc lý do.
 * Dùng `<dialog>` gốc nên Esc và giữ focus trong hộp do trình duyệt lo.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" [attr.aria-labelledby]="'dlg-title'" (cancel)="onCancel($event)">
      <form method="dialog" (submit)="submit($event)">
        <h2 id="dlg-title">{{ title() }}</h2>
        <p class="message">{{ message() }}</p>
        @if (reasonLabel()) {
          <div class="field">
            <label for="dlg-reason">{{ reasonLabel() }}</label>
            @if (reasonOptions().length) {
              <div class="quick">
                @for (option of reasonOptions(); track option) {
                  <button type="button" class="btn" [class.picked]="reason() === option" (click)="reason.set(option)">
                    {{ option }}
                  </button>
                }
              </div>
            }
            <textarea
              id="dlg-reason"
              class="input"
              rows="3"
              maxlength="500"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
            <span class="hint">Tối thiểu {{ minReason() }} ký tự. Lý do được lưu vào nhật ký.</span>
          </div>
        }
        @if (error()) {
          <div class="alert-box" role="alert">{{ error() }}</div>
        }
        <div class="actions">
          <button type="button" class="btn" [disabled]="busy()" (click)="cancelled.emit()">Quay lại</button>
          <button
            type="submit"
            class="btn"
            [class.btn-danger]="danger()"
            [class.btn-primary]="!danger()"
            [disabled]="busy() || !reasonValid()"
          >
            {{ busy() ? 'Đang xử lý…' : confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .dialog {
      width: min(440px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      color: var(--cv-navy);
      box-shadow: var(--cv-shadow);
    }
    .dialog::backdrop {
      background: rgba(11, 48, 86, 0.28);
    }
    h2 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
    }
    .message {
      margin: 0 0 16px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--cv-muted);
    }
    .field {
      margin-bottom: 16px;
    }
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 4px;
    }
    .quick .btn {
      height: 30px;
      padding: 0 12px;
      font-size: 12px;
    }
    .quick .picked {
      border-color: var(--cv-navy);
      background: var(--cv-row-selected);
    }
    .alert-box {
      margin-bottom: 16px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class ConfirmDialogComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Xác nhận');
  readonly danger = input(true);
  /** Có nhãn thì hiện ô lý do bắt buộc. */
  readonly reasonLabel = input('');
  readonly reasonOptions = input<string[]>([]);
  readonly minReason = input(5);
  readonly busy = input(false);
  readonly error = input('');
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly reason = signal('');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected reasonValid(): boolean {
    return !this.reasonLabel() || this.reason().trim().length >= this.minReason();
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.reasonValid() && !this.busy()) this.confirmed.emit(this.reason().trim());
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.cancelled.emit();
  }
}
