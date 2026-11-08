import { Routes } from '@angular/router';
export const IMAGE_SEARCH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./image-search.component').then((m) => m.ImageSearchComponent),
  },
];
