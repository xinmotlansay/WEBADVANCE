import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
export const POLICIES_ROUTES: Routes = [
  {
    path: 'warranty',
    canActivate: [authGuard],
    data: { kind: 'warranty' },
    loadComponent: () => import('./policy.component').then((m) => m.PolicyComponent),
  },
  {
    path: 'returns',
    canActivate: [authGuard],
    data: { kind: 'returns' },
    loadComponent: () => import('./policy.component').then((m) => m.PolicyComponent),
  },
  // Khách chưa đăng nhập cần đọc được trước khi đồng ý lúc đăng ký.
  {
    path: 'terms',
    data: { kind: 'terms' },
    loadComponent: () => import('./policy.component').then((m) => m.PolicyComponent),
  },
  {
    path: 'privacy',
    data: { kind: 'privacy' },
    loadComponent: () => import('./policy.component').then((m) => m.PolicyComponent),
  },
];
