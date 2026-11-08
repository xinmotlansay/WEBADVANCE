import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="cv-popup-backdrop" (click)="cancelled.emit()" aria-hidden="true"></div>
      <div class="cv-dialog" role="alertdialog" aria-modal="true" [attr.aria-label]="title()">
        <header class="cv-dialog__header">{{ title() }}</header>
        <div class="cv-dialog__body">
          <p>{{ message() }}</p>
          @if (warning()) {
            <div class="cv-alert-box" style="margin-top: 12px">{{ warning() }}</div>
          }
          <ng-content />
        </div>
        <footer class="cv-dialog__footer">
          <button type="button" class="cv-btn cv-btn--secondary" (click)="cancelled.emit()">
            {{ cancelLabel() }}
          </button>
          <button
            type="button"
            class="cv-btn"
            [class.cv-btn--danger]="danger()"
            [class.cv-btn--primary]="!danger()"
            [disabled]="loading()"
            (click)="confirmed.emit()"
          >
            {{ loading() ? 'Đang xử lý…' : confirmLabel() }}
          </button>
        </footer>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('Xác nhận thao tác');
  readonly message = input('');
  readonly warning = input('');
  readonly confirmLabel = input('Xác nhận');
  readonly cancelLabel = input('Hủy thao tác');
  readonly danger = input(false);
  readonly loading = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
