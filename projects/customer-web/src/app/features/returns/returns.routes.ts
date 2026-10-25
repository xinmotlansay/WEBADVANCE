import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
export const RETURNS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./return-dashboard.component').then((m) => m.ReturnDashboardComponent),
      },
      {
        path: 'new',
        loadComponent: () => import('./return-form.component').then((m) => m.ReturnFormComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./return-detail.component').then((m) => m.ReturnDetailComponent),
      },
    ],
  },
];
