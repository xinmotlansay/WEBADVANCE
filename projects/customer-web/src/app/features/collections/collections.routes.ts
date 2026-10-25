import { Routes } from '@angular/router';
export const COLLECTIONS_ROUTES: Routes = [
  {
    path: ':slug',
    loadComponent: () =>
      import('./collection-detail.component').then((m) => m.CollectionDetailComponent),
  },
];
