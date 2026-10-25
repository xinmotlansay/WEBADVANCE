import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
export const WARRANTY_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./warranty-dashboard.component').then((m) => m.WarrantyDashboardComponent),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./warranty-form.component').then((m) => m.WarrantyFormComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./warranty-detail.component').then((m) => m.WarrantyDetailComponent),
      },
    ],
  },
];
