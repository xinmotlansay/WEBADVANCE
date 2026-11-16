import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from '../../services/ui/toast.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" role="status" aria-live="polite">
      @if (toast.current(); as t) {
        <!-- @for theo id để mỗi thông báo mới được dựng lại, thanh thời gian chạy lại từ đầu. -->
        @for (item of [t]; track item.id) {
          <div
            class="toast"
            [class.toast--error]="item.kind === 'error'"
            [class.toast--info]="item.kind === 'info'"
            [class.toast--leaving]="toast.leaving()"
          >
            <span class="icon" aria-hidden="true">
              <app-icon [name]="iconFor(item.kind)" [size]="14" />
            </span>
            <span>{{ item.message }}</span>
            <button type="button" class="close" aria-label="Đóng thông báo" (click)="toast.dismiss()">
              <app-icon name="lucide:x" [size]="18" />
            </button>
            <span class="progress" aria-hidden="true" [style.animation-duration.ms]="item.durationMs"></span>
          </div>
        }
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
      position: relative;
      overflow: hidden;
      padding: 12px 12px 15px 16px;
      border-radius: 8px;
      border: 1px solid var(--color-gray-light);
      background: var(--color-white);
      color: var(--color-black);
      font-size: var(--font-size-h5);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--color-black) 20%, transparent);
      animation: toast-in 0.25s ease;
    }
    .progress {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 100%;
      height: 3px;
      background: var(--color-success);
      transform-origin: left center;
      animation-name: toast-progress;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    .toast--error .progress {
      background: var(--color-accent);
    }
    .toast--info .progress {
      background: var(--color-black);
    }
    .toast--info .icon {
      background: var(--color-black);
    }
    @keyframes toast-progress {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
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

  protected iconFor(kind: Toast['kind']): string {
    if (kind === 'error') return 'lucide:x';
    if (kind === 'info') return 'lucide:info';
    return 'lucide:check';
  }
}
