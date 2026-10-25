import { Component } from '@angular/core';
import { DestroyRef, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AccountService } from '../../features/account/account.service';

@Component({
  selector: 'app-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './account-layout.component.html',
  styleUrl: './account-layout.component.css',
})
export class AccountLayoutComponent {
  protected readonly profile;
  protected readonly wideAccountLayout = signal(false);

  protected readonly navigation = [
    { path: 'profile', label: 'Tài khoản của tôi', icon: '♙' },
    { path: 'orders', label: 'Đơn hàng', icon: '▤' },
    { path: 'aftersales', label: 'Dịch vụ hậu mãi', icon: '♧' },
    { path: 'addresses', label: 'Danh sách địa chỉ', icon: '⌖' },
    { path: 'wishlist', label: 'Danh sách yêu thích', icon: '♡' },
    { path: 'reviews', label: 'Đánh giá', icon: '☆' },
    { path: 'vouchers', label: 'Ví voucher', icon: '▣' },
    { path: 'home-profiles', label: 'Hồ sơ nhà', icon: '⌂' },
    { path: 'logout', label: 'Đăng xuất', icon: '⇥' },
  ];

  constructor(accountService: AccountService, router: Router, destroyRef: DestroyRef) {
    this.profile = accountService.profile;
    const updateLayout = (url: string) => {
      this.wideAccountLayout.set(url.startsWith('/account/wishlist') || url.startsWith('/account/aftersales'));
    };
    updateLayout(router.url);
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(destroyRef),
    ).subscribe((event) => updateLayout(event.urlAfterRedirects));
  }
}
