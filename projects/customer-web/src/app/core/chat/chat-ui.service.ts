import { Injectable, signal } from '@angular/core';

/**
 * Trạng thái mở/đóng của hai lối vào chat trên trang chủ.
 * - `aiOpen`: khung trợ lý AI công khai (không cần đăng nhập, không lưu DB).
 * - `supportOpen`: khung chat CSKH (bắt buộc đăng nhập, lưu DB).
 */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  readonly aiOpen = signal(false);
  readonly supportOpen = signal(false);

  toggleAi(): void {
    const next = !this.aiOpen();
    this.aiOpen.set(next);
    if (next) {
      this.supportOpen.set(false);
    }
  }

  closeAi(): void {
    this.aiOpen.set(false);
  }

  toggleSupport(): void {
    const next = !this.supportOpen();
    this.supportOpen.set(next);
    if (next) {
      this.aiOpen.set(false);
    }
  }

  closeSupport(): void {
    this.supportOpen.set(false);
  }
}
