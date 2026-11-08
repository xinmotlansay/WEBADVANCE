import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
export const AFTER_SALES_ROUTES: Routes = [
  {
    path: 'success',
    data: { layout: 'compact' },
    canActivate: [authGuard],
    loadComponent: () => import('./success/request-success.component').then((m) => m.RequestSuccessComponent),
  },
  {
    path: '',
    canActivate: [
      (route, state) =>
        route.queryParamMap.get('view') === 'requests'
          ? authGuard(route, state)
          : true,
    ],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () => import('./after-sales.component').then((m) => m.AfterSalesComponent),
  },
];
