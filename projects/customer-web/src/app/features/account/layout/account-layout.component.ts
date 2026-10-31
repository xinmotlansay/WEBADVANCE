import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../../../shared/ui/icons/icon.component';
import { ReviewQueueService } from '../review-queue.service';

interface AccountNavItem {
  path: string;
  /** Mục dẫn sang trang riêng ngoài khu vực tài khoản. */
  link?: string[];
  label: string;
}

@Component({
  selector: 'app-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-layout.component.html',
  styleUrl: './account-layout.component.css',
})
export class AccountLayoutComponent {
  // Danh sách một cột kiểu trang hồ sơ: các mục viết hoa, mục đang mở in đậm.
  protected readonly navigation: AccountNavItem[] = [
    { path: 'profile', label: 'Thông tin' },
    { path: 'orders', label: 'Đơn hàng' },
    { path: 'after-sales', label: 'Dịch vụ hậu mãi' },
    { path: 'addresses', label: 'Danh sách địa chỉ' },
    { path: 'wishlist', label: 'Danh sách yêu thích' },
    { path: 'vouchers', label: 'Ví voucher' },
    { path: 'home-profiles', label: 'Hồ sơ nhà' },
    { path: 'reviews', label: 'Đánh giá' },
    { path: 'logout', label: 'Đăng xuất' },
  ];

  private readonly queue = inject(ReviewQueueService);

  /** Số sản phẩm chờ đánh giá hiển thị cạnh mục Đánh giá. */
  protected readonly pendingReviewCount = computed(() => this.queue.pending().length);

  constructor() {
    this.queue.refresh().subscribe();
  }
}
