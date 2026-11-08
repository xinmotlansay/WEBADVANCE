import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

const DURATION_MS = 3000;
const LEAVE_MS = 250;

/** Thông báo ngắn ở góc màn hình. Mỗi lúc chỉ hiện một thông báo, cái mới thay cái cũ. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  /** Đang chạy hiệu ứng trượt lên trước khi biến mất. */
  readonly leaving = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;

  success(message: string, durationMs = DURATION_MS): void {
    this.show(message, 'success', durationMs);
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  dismiss(): void {
    clearTimeout(this.timer);
    if (!this.current()) return;
    this.leaving.set(true);
    this.timer = setTimeout(() => this.clear(), LEAVE_MS);
  }

  private show(message: string, kind: Toast['kind'], durationMs = DURATION_MS): void {
    clearTimeout(this.timer);
    this.leaving.set(false);
    this.current.set({ id: ++this.nextId, message, kind });
    this.timer = setTimeout(() => this.dismiss(), durationMs - LEAVE_MS);
  }

  private clear(): void {
    this.current.set(null);
    this.leaving.set(false);
  }
}
