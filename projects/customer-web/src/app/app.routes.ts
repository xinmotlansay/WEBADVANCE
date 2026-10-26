import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/customer-layout/customer-layout.component').then((module) => module.CustomerLayoutComponent),
    children: [
      {
        path: 'account',
        loadComponent: () => import('./account/account-layout/account-layout.component').then((module) => module.AccountLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          { path: 'profile', loadComponent: () => import('./account/pages/profile/profile.component').then((module) => module.ProfileComponent) },
          { path: 'orders', loadComponent: () => import('./account/pages/orders/orders.component').then((module) => module.OrdersComponent) },
          { path: 'aftersales', loadComponent: () => import('./account/pages/aftersales/aftersales.component').then((module) => module.AftersalesComponent) },
          { path: 'addresses', loadComponent: () => import('./account/pages/addresses/addresses.component').then((module) => module.AddressesComponent) },
          { path: 'wishlist', loadComponent: () => import('./account/pages/wishlist/wishlist.component').then((module) => module.WishlistComponent) },
          { path: 'reviews', loadComponent: () => import('./account/pages/reviews/reviews.component').then((module) => module.ReviewsComponent) },
          { path: 'vouchers', loadComponent: () => import('./account/pages/vouchers/vouchers.component').then((module) => module.VouchersComponent) },
          { path: 'home-profiles', loadComponent: () => import('./account/pages/home-profiles/home-profiles.component').then((module) => module.HomeProfilesComponent) },
          { path: 'logout', loadComponent: () => import('./account/pages/logout/logout.component').then((module) => module.LogoutComponent) },
        ],
      },
      { path: 'products/:id', loadComponent: () => import('./features/product-detail/product-detail-page/product-detail-page.component').then((module) => module.ProductDetailPageComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'account/profile' },
    ],
  },
  { path: '**', redirectTo: 'account/profile' },
];
