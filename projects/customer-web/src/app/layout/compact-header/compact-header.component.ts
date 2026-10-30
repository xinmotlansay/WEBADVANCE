import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icons/icon.component';

/** Cuộn quá ngưỡng này (px) thì ẩn header khi bật `hideOnScroll`. */
const HIDE_AFTER_PX = 8;

/**
 * Header rút gọn cho các trang tập trung (Fit your home): nút back, logo, icon tài khoản.
 * Trang dùng header này khai báo `data: { layout: 'compact' }` trên route để ẩn header chính.
 */
@Component({
  selector: 'app-compact-header',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compact-header.component.html',
  styleUrl: './compact-header.component.css',
  host: {
    '[class.hidden]': 'hidden()',
    '(window:scroll)': 'onScroll()',
  },
})
export class CompactHeaderComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Nơi về khi không có trang trước trong web (mở bằng link trực tiếp, tab mới). */
  readonly fallbackLink = input<string[]>(['/']);
  /** Chỉ hiện header khi trang ở trên cùng, cuộn xuống thì ẩn. */
  readonly hideOnScroll = input(false);

  protected readonly hidden = signal(false);

  // Header được tạo trong lúc điều hướng vào trang, nên đây là lần điều hướng đã mở trang này.
  private readonly hasPreviousPage = !!this.router.getCurrentNavigation()?.previousNavigation;

  constructor() {
    // Trang có thể mở ở vị trí đã cuộn (khôi phục cuộn khi Back), nên tính ngay lần đầu.
    afterNextRender(() => this.onScroll());
  }

  protected onScroll(): void {
    this.hidden.set(this.hideOnScroll() && window.scrollY > HIDE_AFTER_PX);
  }

  protected back(): void {
    if (this.hasPreviousPage) this.location.back();
    else void this.router.navigate(this.fallbackLink());
  }
}
