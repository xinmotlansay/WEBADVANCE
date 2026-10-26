import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-account-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './account-layout.component.html',
  styleUrl: './account-layout.component.css',
})
export class AccountLayoutComponent {
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

}
