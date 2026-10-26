import { Injectable, signal } from '@angular/core';

/** Trạng thái ô tìm kiếm trên header, để các nơi khác (nút nổi ở chân trang) mở được nó. */
@Injectable({ providedIn: 'root' })
export class SearchUiService {
  readonly open = signal(false);
  /** Tăng mỗi lần có yêu cầu đưa con trỏ vào ô tìm kiếm. */
  readonly focusRequest = signal(0);

  openSearch(): void {
    this.open.set(true);
    this.focusRequest.update((n) => n + 1);
  }

  closeSearch(): void {
    this.open.set(false);
  }
}
