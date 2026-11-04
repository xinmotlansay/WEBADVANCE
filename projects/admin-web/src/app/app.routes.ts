import { Routes } from '@angular/router';
import { RoleName } from 'shared';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

/** Sản phẩm, danh mục, tồn kho, đánh giá, cấp vận chuyển (ma trận mục 5). */
/** Đơn hàng, thanh toán, vận chuyển, đổi trả, bảo hành, chat, khách hàng, báo cáo đơn hàng. */
const orderRoles = roleGuard(RoleName.SUPER_ADMIN, RoleName.ORDER_ADMIN);

const productRoles = roleGuard(RoleName.SUPER_ADMIN, RoleName.PRODUCT_ADMIN);

export const routes: Routes = [
  {
    path: 'dang-nhap',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'san-pham',
        canActivate: [productRoles],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/products/products.component').then((m) => m.ProductsComponent),
          },
          {
            path: 'them',
            canDeactivate: [(form: { canLeave(): boolean }) => form.canLeave()],
            loadComponent: () =>
              import('./features/products/product-form.component').then((m) => m.ProductFormComponent),
          },
          {
            path: ':id/sua',
            canDeactivate: [(form: { canLeave(): boolean }) => form.canLeave()],
            loadComponent: () =>
              import('./features/products/product-form.component').then((m) => m.ProductFormComponent),
          },
        ],
      },
      {
        path: 'danh-muc',
        canActivate: [productRoles],
        loadComponent: () =>
          import('./features/categories/categories.component').then((m) => m.CategoriesComponent),
      },
      {
        path: 'ton-kho',
        canActivate: [productRoles],
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryComponent),
      },
      {
        path: 'van-chuyen',
        canActivate: [productRoles],
        loadComponent: () =>
          import('./features/shipping/shipping-tiers.component').then((m) => m.ShippingTiersComponent),
      },
      {
        path: 'danh-gia',
        canActivate: [productRoles],
        loadComponent: () =>
          import('./features/reviews/reviews.component').then((m) => m.ReviewsComponent),
      },
      {
        path: 'admin/dashboard',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/dashboard/dashboard-screen.component').then((m) => m.DashboardScreenComponent),
      },
      {
        path: 'admin/orders',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/orders/orders-screen.component').then((m) => m.OrdersScreenComponent),
      },
      {
        path: 'admin/payments',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/payments/payments-screen.component').then((m) => m.PaymentsScreenComponent),
      },
      {
        path: 'admin/shipping',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/shipping/shipping-screen.component').then((m) => m.ShippingScreenComponent),
      },
      {
        path: 'admin/delivery-failed',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/delivery-failed/delivery-failed-screen.component').then((m) => m.DeliveryFailedScreenComponent),
      },
      {
        path: 'admin/returns',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/returns/returns-screen.component').then((m) => m.ReturnsScreenComponent),
      },
      {
        path: 'admin/warranty',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/warranty/warranty-screen.component').then((m) => m.WarrantyScreenComponent),
      },
      {
        path: 'admin/chat',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/chat/chat-screen.component').then((m) => m.ChatScreenComponent),
      },
      {
        path: 'admin/customers',
        canActivate: [orderRoles],
        loadComponent: () =>
          import('./features/customers/customers-screen.component').then((m) => m.CustomersScreenComponent),
      },
      { path: 'admin/reports/orders', redirectTo: 'admin/dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
