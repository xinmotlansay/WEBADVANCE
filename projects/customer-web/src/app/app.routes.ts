import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'support', loadChildren: () => import('./features/after-sales/after-sales.routes').then((m) => m.AFTER_SALES_ROUTES) },
  { path: 'account/after-sales', redirectTo: '/support', pathMatch: 'full' },
  { path: 'inspirations', loadChildren: () => import('./features/inspirations/inspirations.routes').then((m) => m.INSPIRATIONS_ROUTES) },
  { path: 'policies', loadChildren: () => import('./features/policies/policies.routes').then((m) => m.POLICIES_ROUTES) },
  { path: 'account/returns', loadChildren: () => import('./features/returns/returns.routes').then((m) => m.RETURNS_ROUTES) },
  { path: 'account/warranty', loadChildren: () => import('./features/warranty/warranty.routes').then((m) => m.WARRANTY_ROUTES) },
  { path: '', loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES) },
  { path: 'collections', loadChildren: () => import('./features/collections/collections.routes').then((m) => m.COLLECTIONS_ROUTES) },
  { path: 'search/image', loadChildren: () => import('./features/image-search/image-search.routes').then((m) => m.IMAGE_SEARCH_ROUTES) },
  { path: 'products', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  { path: 'search', loadChildren: () => import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES) },
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  // Các trang chưa làm (sản phẩm, tìm kiếm, giỏ hàng...) tạm đưa về trang chủ.
  { path: '**', redirectTo: '' },
];
