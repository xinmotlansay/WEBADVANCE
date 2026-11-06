import { Injectable, inject } from '@angular/core';
import { CatalogApiService } from 'shared';
import { firstTime } from './banner-rules';

const SESSION_KEY = 'cv.bannerTracked';

/** Ghi lượt hiển thị/nhấp banner, mỗi banner tối đa 1 lượt mỗi loại trong một phiên trình duyệt. */
@Injectable({ providedIn: 'root' })
export class BannerTrackerService {
  private readonly api = inject(CatalogApiService);
  private readonly seen = new Set<string>(this.read());

  impression(id: string): void {
    this.track(id, 'impression');
  }

  click(id: string): void {
    this.track(id, 'click');
  }

  private track(id: string, action: 'impression' | 'click'): void {
    if (!firstTime(this.seen, `${action}:${id}`)) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...this.seen]));
    } catch {
      // Không lưu được thì vẫn chặn trùng trong lần tải trang này.
    }
    // Số liệu thống kê không được làm hỏng trang: lỗi thì bỏ qua.
    this.api.trackBanner(id, action).subscribe({ error: () => undefined });
  }

  private read(): string[] {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }
}
