import { Routes } from '@angular/router';
export const INSPIRATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./inspirations.component').then((m) => m.InspirationsComponent),
  },
];
