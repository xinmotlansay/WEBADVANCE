import { Component, effect } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AccountReadApiService } from '../../features/account/account-read-api.service';
import { IconComponent, IconName } from '../../shared/icon/icon.component';

interface AccountNavItem {
  path: string;
  label: string;
  icon: IconName;
}

@Component({
  selector: 'app-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  templateUrl: './account-layout.component.html',
  styleUrl: './account-layout.component.css',
})
export class AccountLayoutComponent {
  // Theo Figma: nhóm quản lý tài khoản, rồi nhóm Đánh giá / Đăng xuất ngăn bằng đường kẻ.
  protected readonly navigation: AccountNavItem[][] = [
    [
      { path: 'profile', label: 'Tài khoản của tôi', icon: 'user' },
      { path: 'orders', label: 'Đơn hàng', icon: 'archive' },
      { path: 'aftersales', label: 'Dịch vụ hậu mãi', icon: 'wrench' },
      { path: 'addresses', label: 'Danh sách địa chỉ', icon: 'map-pin' },
      { path: 'wishlist', label: 'Danh sách yêu thích', icon: 'heart' },
    ],
    [
      { path: 'reviews', label: 'Đánh giá', icon: 'star' },
      { path: 'logout', label: 'Đăng xuất', icon: 'log-out' },
    ],
  ];

  constructor(protected readonly accountApi: AccountReadApiService) {
    accountApi.getPreviewUserId();
    // Số sản phẩm chờ đánh giá hiển thị cạnh mục Đánh giá.
    effect((onCleanup) => {
      const userId = accountApi.previewUserId();
      if (!userId) return;
      const subscription = accountApi.getReviewableItems(userId).subscribe({ error: () => accountApi.pendingReviewCount.set(0) });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
