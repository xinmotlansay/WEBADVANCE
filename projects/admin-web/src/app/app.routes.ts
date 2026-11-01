import { Routes } from '@angular/router';
import { RoleName } from 'shared';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

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
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
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
    ],
  },
  { path: '**', redirectTo: '' },
];
