import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
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
];
