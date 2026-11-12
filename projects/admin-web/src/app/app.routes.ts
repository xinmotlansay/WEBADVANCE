import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { RoleName } from 'shared';
import { AdminAuthService } from './services/auth/admin-auth.service';
import { marketingGuard } from './features/marketing/marketing.guard';
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
    // AD-11: Admin mới đặt mật khẩu từ liên kết email, chưa đăng nhập.
    path: 'dat-mat-khau',
    loadComponent: () =>
      import('./features/auth/set-password/set-password.component').then((m) => m.SetPasswordComponent),
  },
  {
    // Admin đăng nhập bằng mật khẩu tạm phải đổi mật khẩu trước khi vào các trang khác.
    path: 'doi-mat-khau',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/force-change-password/force-change-password.component').then(
        (m) => m.ForceChangePasswordComponent,
      ),
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
        // Order Admin không có trang chủ riêng: vào thẳng Tổng quan đơn hàng.
        canActivate: [
          () =>
            inject(AdminAuthService).user()?.roleName === RoleName.ORDER_ADMIN
              ? inject(Router).createUrlTree(['/admin/dashboard'])
              : true,
        ],
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
      {
        path: 'quan-ly-admin',
        canActivate: [roleGuard(RoleName.SUPER_ADMIN)],
        loadComponent: () =>
          import('./features/super-admin/admins/admins.component').then((m) => m.AdminsComponent),
      },
      {
        path: 'nhat-ky-cau-hinh',
        canActivate: [roleGuard(RoleName.SUPER_ADMIN)],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'nhat-ky' },
          {
            path: 'nhat-ky',
            loadComponent: () =>
              import('./features/super-admin/system/audit-logs.component').then((m) => m.AuditLogsComponent),
          },
          {
            path: 'cau-hinh',
            loadComponent: () =>
              import('./features/super-admin/system/system-config.component').then((m) => m.SystemConfigComponent),
          },
        ],
      },
      {
        path: 'marketing',
        canActivate: [marketingGuard],
        loadChildren: () =>
          import('./features/marketing/marketing.routes').then((m) => m.MARKETING_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
