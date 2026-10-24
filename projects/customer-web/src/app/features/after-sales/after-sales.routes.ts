import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
export const AFTER_SALES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [
      (route, state) =>
        ['warranty', 'return', 'requests'].includes(route.queryParamMap.get('view') ?? '')
          ? authGuard(route, state)
          : true,
    ],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    loadComponent: () => import('./after-sales.component').then((m) => m.AfterSalesComponent),
  },
];
