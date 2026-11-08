import { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/account-layout.component').then((m) => m.AccountLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'profile', title: 'Tài khoản của tôi | CaraVeso', loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileComponent) },
      { path: 'after-sales', title: 'Dịch vụ hậu mãi | CaraVeso', loadComponent: () => import('./pages/after-sales/after-sales.component').then((m) => m.AfterSalesComponent) },
      { path: 'orders', title: 'Đơn hàng | CaraVeso', loadComponent: () => import('./pages/orders/orders.component').then((m) => m.OrdersComponent) },
      { path: 'addresses', title: 'Danh sách địa chỉ | CaraVeso', loadComponent: () => import('./pages/addresses/addresses.component').then((m) => m.AddressesComponent) },
      { path: 'wishlist', title: 'Danh sách yêu thích | CaraVeso', loadComponent: () => import('./pages/wishlist/wishlist.component').then((m) => m.WishlistComponent) },
      { path: 'reviews', title: 'Đánh giá | CaraVeso', loadComponent: () => import('./pages/reviews/reviews.component').then((m) => m.ReviewsComponent) },
      { path: 'vouchers', title: 'Ví voucher | CaraVeso', loadComponent: () => import('./pages/vouchers/vouchers.component').then((m) => m.VouchersComponent) },
      { path: 'home-profiles', title: 'Hồ sơ nhà | CaraVeso', loadComponent: () => import('./pages/home-profiles/home-profiles.component').then((m) => m.HomeProfilesComponent) },
      { path: 'logout', title: 'Đăng xuất | CaraVeso', loadComponent: () => import('./pages/logout/logout.component').then((m) => m.LogoutComponent) },
    ],
  },
];
