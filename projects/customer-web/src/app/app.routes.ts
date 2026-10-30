import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'support', loadChildren: () => import('./features/after-sales/after-sales.routes').then((m) => m.AFTER_SALES_ROUTES) },
  { path: 'policies', loadChildren: () => import('./features/policies/policies.routes').then((m) => m.POLICIES_ROUTES) },
  { path: 'search/image', loadChildren: () => import('./features/image-search/image-search.routes').then((m) => m.IMAGE_SEARCH_ROUTES) },
  { path: 'products', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  { path: 'search', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: 'promotions',
    loadChildren: () =>
      import('./features/promotions/promotions.routes').then((m) => m.PROMOTIONS_ROUTES),
  },
  {
    path: 'collections',
    loadChildren: () =>
      import('./features/collections/collections.routes').then((m) => m.COLLECTION_ROUTES),
  },
  {
    path: 'inspirations',
    loadChildren: () =>
      import('./features/inspirations/inspirations.routes').then((m) => m.INSPIRATIONS_ROUTES),
  },
  {
    path: 'view-your-room',
    loadChildren: () =>
      import('./features/view-your-room/view-your-room.routes').then(
        (m) => m.VIEW_YOUR_ROOM_ROUTES,
      ),
  },
  {
    path: 'fit-your-home',
    loadChildren: () =>
      import('./features/fit-your-home/fit-your-home.routes').then((m) => m.FIT_YOUR_HOME_ROUTES),
  },
  {
    path: 'cart',
    loadChildren: () => import('./features/cart/cart.routes').then((m) => m.CART_ROUTES),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/checkout/checkout.routes').then((m) => m.CHECKOUT_ROUTES),
  },
  {
    path: 'auth',
    // Header trắng ngay từ đầu vì trang không có ảnh lớn ở đầu trang.
    data: { layout: 'solid' },
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    data: { layout: 'solid' },
    loadChildren: () => import('./features/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
  },
  // Các trang chưa làm (sản phẩm, tìm kiếm...) tạm đưa về trang chủ.
  { path: '**', redirectTo: '' },
];
