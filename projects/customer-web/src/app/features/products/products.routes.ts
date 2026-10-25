import { Routes } from '@angular/router';
export const PRODUCTS_ROUTES: Routes = [
  {
    path: ':slug',
    loadComponent: () => import('./product-detail.component').then((m) => m.ProductDetailComponent),
  },
  {
    path: '',
    loadComponent: () => import('./product-list.component').then((m) => m.ProductListComponent),
  },
];
