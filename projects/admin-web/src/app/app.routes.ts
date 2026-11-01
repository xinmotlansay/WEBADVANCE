import { Routes } from '@angular/router';
import { adminAuthGuard, adminGuestGuard } from './core/auth/admin-auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { ORDER_ADMIN_ROLES } from './core/nav/admin-menu';
import { AdminShellComponent } from './layout/admin-shell/admin-shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/dashboard' },
  { path: 'dang-nhap', pathMatch: 'full', redirectTo: 'admin/login' },
  {
    path: 'admin/login',
    canActivate: [adminGuestGuard],
    loadComponent: () =>
      import('./features/auth/login/admin-login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'admin',
    component: AdminShellComponent,
    canActivate: [adminAuthGuard],
    canActivateChild: [roleGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'access-denied',
        loadComponent: () =>
          import('./features/auth/access-denied-screen.component').then(
            (m) => m.AccessDeniedScreenComponent,
          ),
      },
      {
        path: 'dashboard',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/dashboard/dashboard-screen.component').then(
            (m) => m.DashboardScreenComponent,
          ),
      },
      {
        path: 'orders',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/orders/orders-screen.component').then((m) => m.OrdersScreenComponent),
      },
      {
        path: 'payments',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/payments/payments-screen.component').then(
            (m) => m.PaymentsScreenComponent,
          ),
      },
      {
        path: 'shipping',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/shipping/shipping-screen.component').then(
            (m) => m.ShippingScreenComponent,
          ),
      },
      {
        path: 'delivery-failed',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/delivery-failed/delivery-failed-screen.component').then(
            (m) => m.DeliveryFailedScreenComponent,
          ),
      },
      {
        path: 'returns',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/returns/returns-screen.component').then(
            (m) => m.ReturnsScreenComponent,
          ),
      },
      {
        path: 'warranty',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/warranty/warranty-screen.component').then(
            (m) => m.WarrantyScreenComponent,
          ),
      },
      {
        path: 'chat',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/chat/chat-screen.component').then((m) => m.ChatScreenComponent),
      },
      {
        path: 'customers',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/customers/customers-screen.component').then(
            (m) => m.CustomersScreenComponent,
          ),
      },
      {
        path: 'reports/orders',
        data: { roles: ORDER_ADMIN_ROLES },
        loadComponent: () =>
          import('./features/reports/order-report-screen.component').then(
            (m) => m.OrderReportScreenComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'admin/dashboard' },
];
