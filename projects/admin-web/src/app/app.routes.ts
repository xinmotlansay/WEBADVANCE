import { Routes } from '@angular/router';
import { marketingGuard } from './features/marketing/marketing.guard';
import { authGuard, guestGuard } from './core/guards/auth.guard';

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
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
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
