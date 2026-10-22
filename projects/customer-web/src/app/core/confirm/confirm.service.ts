import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Nhãn nút đồng ý, ví dụ "Xóa". */
  confirmText: string;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** Hộp xác nhận thay cho `window.confirm()`. Mỗi lúc một hộp, hộp mới coi hộp cũ là hủy. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    this.request()?.resolve(false);
    return new Promise((resolve) => this.request.set({ ...options, resolve }));
  }

  close(ok: boolean): void {
    this.request()?.resolve(ok);
    this.request.set(null);
  }
}
