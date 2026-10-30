import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast/toast.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" role="status" aria-live="polite">
      @if (toast.current(); as t) {
        <div class="toast" [class.toast--error]="t.kind === 'error'">
          <span>{{ t.message }}</span>
          <button type="button" class="close" aria-label="Đóng thông báo" (click)="toast.dismiss()">
            <app-icon name="lucide:x" [size]="18" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .region {
      position: fixed;
      right: var(--page-gutter);
      bottom: 24px;
      z-index: 60;
      max-width: min(420px, calc(100vw - 2 * var(--page-gutter)));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 12px 12px 16px;
      border-radius: 8px;
      background: var(--color-primary);
      color: var(--color-white);
      font-size: var(--font-size-h5);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--color-black) 20%, transparent);
      animation: toast-in 0.2s ease;
    }
    .toast--error {
      background: var(--color-accent);
    }
    .close {
      display: grid;
      place-items: center;
      margin-left: auto;
      padding: 0;
      border: 0;
      background: none;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
