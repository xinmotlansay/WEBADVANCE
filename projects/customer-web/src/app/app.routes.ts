import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
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
    loadChildren: () =>
      import('./features/checkout/checkout.routes').then((m) => m.CHECKOUT_ROUTES),
  },
  // Các trang chưa làm (sản phẩm, tìm kiếm, tài khoản...) tạm đưa về trang chủ.
  { path: '**', redirectTo: '' },
];
