import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
export const AUTH_ROUTES: Routes = [
  { path: 'login', loadComponent: () => import('./login.component').then((m) => m.LoginComponent) },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./account.component').then((m) => m.AccountComponent),
  },
];
