import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

const DURATION_MS = 3000;

/** Thông báo ngắn ở góc màn hình. Mỗi lúc chỉ hiện một thông báo, cái mới thay cái cũ. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }

  private show(message: string, kind: Toast['kind']): void {
    clearTimeout(this.timer);
    this.current.set({ id: ++this.nextId, message, kind });
    this.timer = setTimeout(() => this.current.set(null), DURATION_MS);
  }
}
