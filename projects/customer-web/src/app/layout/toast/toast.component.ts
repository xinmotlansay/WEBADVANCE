import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/ui/toast.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" role="status" aria-live="polite">
      @if (toast.current(); as t) {
        <div class="toast" [class.toast--error]="t.kind === 'error'" [class.toast--leaving]="toast.leaving()">
          <span class="icon" aria-hidden="true">
            <app-icon [name]="t.kind === 'error' ? 'lucide:x' : 'lucide:check'" [size]="14" />
          </span>
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
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      max-width: min(420px, calc(100vw - 2 * var(--page-gutter)));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 12px 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--color-gray-light);
      background: var(--color-white);
      color: var(--color-black);
      font-size: var(--font-size-h5);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--color-black) 20%, transparent);
      animation: toast-in 0.25s ease;
    }
    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--color-success);
      color: var(--color-white);
    }
    .toast--error .icon {
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
    .toast--leaving {
      animation: toast-out 0.25s ease forwards;
    }
    @keyframes toast-out {
      to {
        opacity: 0;
        transform: translateY(-16px);
      }
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(-16px);
      }
    }
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
