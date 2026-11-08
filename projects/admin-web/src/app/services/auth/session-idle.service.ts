import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { AdminAuthService } from './admin-auth.service';

/** Nhắc trước khi hết phiên khoảng 2 phút (admin-ui-rule mục 9). */
const WARNING_BEFORE_SECONDS = 120;
/** Gia hạn phiên phía server (refresh trượt) tối đa mỗi 5 phút khi còn thao tác. */
const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

/**
 * Theo dõi thao tác của Admin: 30 phút không thao tác thì hết phiên (NF-A02).
 * Còn thao tác thì định kỳ gọi refresh để server trượt hạn phiên theo hoạt động.
 */
@Injectable({ providedIn: 'root' })
export class SessionIdleService {
  private readonly auth = inject(AdminAuthService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** Số giây còn lại trước khi hết phiên, chỉ có giá trị khi đã vào giai đoạn cảnh báo. */
  readonly warningSecondsLeft = signal<number | null>(null);

  private lastActivityAt = Date.now();
  private lastKeepAliveAt = Date.now();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly onActivity = (): void => this.markActivity();

  start(): void {
    if (this.ticker !== null) return;

    this.lastActivityAt = Date.now();
    this.lastKeepAliveAt = Date.now();

    this.zone.runOutsideAngular(() => {
      for (const name of ACTIVITY_EVENTS) {
        window.addEventListener(name, this.onActivity, { passive: true });
      }
      this.ticker = setInterval(() => this.tick(), 1000);
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  stop(): void {
    if (this.ticker === null) return;
    for (const name of ACTIVITY_EVENTS) {
      window.removeEventListener(name, this.onActivity);
    }
    clearInterval(this.ticker);
    this.ticker = null;
    this.warningSecondsLeft.set(null);
  }

  /** Bấm "Tiếp tục phiên": tính là có thao tác và gia hạn ngay phía server. */
  extend(): void {
    this.lastActivityAt = Date.now();
    this.keepAlive();
    this.zone.run(() => this.warningSecondsLeft.set(null));
  }

  private markActivity(): void {
    // Đang cảnh báo thì chỉ nút "Tiếp tục phiên" mới gia hạn, tránh vô tình cuộn trang mà mất cảnh báo.
    if (this.warningSecondsLeft() === null) {
      this.lastActivityAt = Date.now();
    }
  }

  private tick(): void {
    const timeoutMs = this.auth.idleTimeoutSeconds() * 1000;
    const idleMs = Date.now() - this.lastActivityAt;
    const leftSeconds = Math.ceil((timeoutMs - idleMs) / 1000);

    if (leftSeconds <= 0) {
      this.zone.run(() => {
        this.stop();
        this.auth.expireSession();
      });
      return;
    }

    if (leftSeconds <= WARNING_BEFORE_SECONDS) {
      this.zone.run(() => this.warningSecondsLeft.set(leftSeconds));
      return;
    }

    if (Date.now() - this.lastKeepAliveAt >= KEEP_ALIVE_INTERVAL_MS && idleMs < KEEP_ALIVE_INTERVAL_MS) {
      this.keepAlive();
    }
  }

  private keepAlive(): void {
    this.lastKeepAliveAt = Date.now();
    this.auth.refreshOnce().subscribe({ error: () => undefined });
  }
}
