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
        canActivate: [roleGuard(RoleName.SUPER_ADMIN, RoleName.PRODUCT_ADMIN)],
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
    ],
  },
  { path: '**', redirectTo: '' },
];
