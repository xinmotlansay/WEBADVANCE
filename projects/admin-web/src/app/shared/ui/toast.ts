import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

/** Thông báo ngắn sau thao tác (xác nhận đơn, nhập kho…), tự ẩn sau vài giây. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private nextId = 0;

  show(text: string, tone: Toast['tone'] = 'ok'): void {
    const id = this.nextId++;
    this.items.update((items) => [...items.slice(-2), { id, text, tone }]);
    setTimeout(() => this.dismiss(id), tone === 'error' ? 7000 : 4000);
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (toast of toasts.items(); track toast.id) {
        <div class="toast" [class.error]="toast.tone === 'error'" [attr.role]="toast.tone === 'error' ? 'alert' : 'status'">
          <span>{{ toast.text }}</span>
          <button type="button" aria-label="Đóng thông báo" (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      z-index: 40;
      top: 24px;
      right: 24px;
      display: grid;
      gap: 8px;
      width: min(360px, calc(100vw - 32px));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border: 1px solid var(--cv-border-strong);
      border-left: 4px solid var(--cv-accent-bar);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      color: var(--cv-navy);
      font-size: 13px;
      line-height: 1.5;
      box-shadow: var(--cv-shadow);
      animation: slide 0.18s ease-out;
    }
    .toast.error {
      border-left-color: var(--cv-danger-text);
      color: var(--cv-danger-text);
    }
    button {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    @keyframes slide {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
