import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-reason-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="cv-popup-backdrop" (click)="cancelled.emit()" aria-hidden="true"></div>
      <div class="cv-dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()">
        <header class="cv-dialog__header">{{ title() }}</header>
        <div class="cv-dialog__body cv-stack">
          @if (options().length) {
            <div class="cv-field">
              <label class="cv-field__label" [attr.for]="'reason-' + title()">Lý do</label>
              <select
                class="cv-select"
                [id]="'reason-' + title()"
                [value]="reason()"
                (change)="reason.set($any($event.target).value)"
              >
                @for (option of options(); track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>
          } @else {
            <div class="cv-field">
              <label class="cv-field__label" [attr.for]="'reason-' + title()">Lý do</label>
              <input
                class="cv-input"
                [id]="'reason-' + title()"
                [value]="reason()"
                (input)="reason.set($any($event.target).value)"
                placeholder="Nhập lý do"
              />
            </div>
          }

          <div class="cv-field">
            <label class="cv-field__label" [attr.for]="'note-' + title()">
              {{ noteLabel() }} {{ noteRequired() ? '' : '(không bắt buộc)' }}
            </label>
            <textarea
              class="cv-textarea"
              [id]="'note-' + title()"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
              [placeholder]="notePlaceholder()"
            ></textarea>
          </div>

          @if (error()) {
            <div class="cv-error" role="alert">{{ error() }}</div>
          }

          @if (warning()) {
            <div class="cv-alert-box">{{ warning() }}</div>
          }
        </div>
        <footer class="cv-dialog__footer">
          <button type="button" class="cv-btn cv-btn--secondary" (click)="cancelled.emit()">Hủy thao tác</button>
          <button type="button" class="cv-btn cv-btn--danger" [disabled]="loading()" (click)="submit()">
            {{ loading() ? 'Đang xử lý…' : confirmLabel() }}
          </button>
        </footer>
      </div>
    }
  `,
})
export class ReasonDialogComponent {
  readonly open = input(false);
  readonly title = input('Ghi lý do');
  readonly confirmLabel = input('Xác nhận');
  readonly options = input<Array<{ value: string; label: string }>>([]);
  readonly noteLabel = input('Ghi chú');
  readonly noteRequired = input(false);
  readonly notePlaceholder = input('Thông tin thêm cho khách hàng hoặc kế toán');
  readonly warning = input('');
  readonly loading = input(false);

  readonly reason = signal('');
  readonly note = signal('');
  readonly error = signal('');

  readonly submitted = output<{ reason: string; note: string }>();
  readonly cancelled = output<void>();

  submit(): void {
    const hasOptions = this.options().length > 0;
    const reason = hasOptions ? this.reason() || this.options()[0]?.value : this.reason().trim();
    if (hasOptions && !reason) {
      this.error.set('Vui lòng chọn lý do');
      return;
    }
    if (!hasOptions && !reason) {
      this.error.set('Vui lòng nhập lý do');
      return;
    }
    if (this.noteRequired() && !this.note().trim()) {
      this.error.set('Vui lòng ghi chú cho thao tác này');
      return;
    }
    this.error.set('');
    this.submitted.emit({ reason: reason ?? '', note: this.note().trim() });
  }
}
