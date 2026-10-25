import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/customer-layout/customer-layout.component').then((module) => module.CustomerLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'products/sofa-da-milan' },
      {
        path: 'products/:id',
        loadComponent: () => import('./features/product-detail/product-detail-page/product-detail-page.component').then((module) => module.ProductDetailPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'products/sofa-da-milan' },
];
