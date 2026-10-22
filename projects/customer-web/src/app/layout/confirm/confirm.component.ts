import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../core/confirm/confirm.service';

/**
 * `<dialog>` gốc của trình duyệt: tự khóa focus, Esc để đóng. Bấm ra nền tối cũng là hủy.
 * Nút hủy nhận focus đầu tiên để Enter không vô tình xóa.
 */
@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.request(); as r) {
      <dialog
        #dialog
        class="dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        (close)="confirm.close(dialog.returnValue === 'ok')"
        (click)="$event.target === dialog ? dialog.close() : null"
      >
        <!-- Handler không được trả về false: Angular sẽ preventDefault và nút submit không đóng hộp. -->
        <div class="body">
          <h2 id="confirm-title">{{ r.title }}</h2>
          <p id="confirm-message">{{ r.message }}</p>
          <form method="dialog" class="actions">
            <button type="submit" class="btn btn--outline" value="cancel" autofocus>Hủy</button>
            <button type="submit" class="btn btn--primary" value="ok">{{ r.confirmText }}</button>
          </form>
        </div>
      </dialog>
    }
  `,
  styles: `
    .dialog {
      width: min(420px, calc(100vw - 32px));
      padding: 0;
      border: 0;
      border-radius: 16px;
      animation: dialog-in 0.18s ease;
    }
    /* Padding nằm ở .body để bấm vào khoảng trắng trong hộp không bị tính là bấm ra nền. */
    .body {
      padding: 24px;
    }
    .dialog::backdrop {
      background: color-mix(in srgb, var(--color-black) 45%, transparent);
    }
    h2 {
      font-size: var(--font-size-h3);
      font-weight: var(--font-weight-semibold);
    }
    p {
      margin-top: 8px;
      color: var(--color-muted);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }
    @keyframes dialog-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }
  `,
})
export class ConfirmComponent {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
}
