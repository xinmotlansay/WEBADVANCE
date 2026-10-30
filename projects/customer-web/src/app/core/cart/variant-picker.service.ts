import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';

const PICK_PARAM = 'pick';

/**
 * Mở popup chọn biến thể, điểm vào chính của Thêm giỏ / Mua ngay (spec giỏ hàng mục 4.2).
 * - `add`, `buy`: từ thẻ sản phẩm, nhấn mạnh nút tương ứng.
 * - `update`: đổi biến thể, số lượng, lắp đặt của một dòng trong giỏ.
 */
export type VariantPickerRequest =
  | { mode: 'add' | 'buy'; slug: string }
  | {
      mode: 'update';
      slug: string;
      itemId: string;
      variantId: string;
      quantity: number;
      hasInstallation: boolean;
    };

@Injectable({ providedIn: 'root' })
export class VariantPickerService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly request = signal<VariantPickerRequest | null>(null);

  constructor() {
    // Rời trang (vd: bị chuyển sang đăng nhập vì phiên hết hạn) thì không để popup treo lại.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());

    // Đăng nhập xong quay lại trang có `?pick=add:<slug>`: mở lại đúng popup khách đang bấm.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.reopenAfterLogin());
  }

  open(request: VariantPickerRequest): void {
    // Không có giỏ cho khách vãng lai (spec giỏ hàng mục 4.1): chuyển đăng nhập trước khi chọn.
    if (!this.auth.isAuthenticated()) {
      const back = this.router.parseUrl(this.router.url);
      back.queryParams = { ...back.queryParams, [PICK_PARAM]: `${request.mode}:${request.slug}` };
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.serializeUrl(back) },
      });
      return;
    }
    this.request.set(request);
  }

  private reopenAfterLogin(): void {
    const pick = this.router.parseUrl(this.router.url).queryParamMap.get(PICK_PARAM);
    if (!pick || !this.auth.isAuthenticated()) return;
    const [mode, slug] = pick.split(':');
    // Xóa tham số trước (lần điều hướng này đóng popup), rồi mới mở.
    void this.router
      .navigate([], {
        queryParams: { [PICK_PARAM]: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then(() => {
        if (slug && (mode === 'add' || mode === 'buy')) this.request.set({ mode, slug });
      });
  }

  close(): void {
    this.request.set(null);
  }
}
