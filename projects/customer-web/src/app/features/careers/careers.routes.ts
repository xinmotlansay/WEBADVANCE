import { Routes } from '@angular/router';

export const CAREERS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./careers.component').then((m) => m.CareersComponent) },
  { path: ':slug', loadComponent: () => import('./job-detail.component').then((m) => m.JobDetailComponent) },
];
