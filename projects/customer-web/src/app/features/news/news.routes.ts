import type { Routes } from '@angular/router';

export const NEWS_ROUTES: Routes = [
  {
    path: '',
    title: 'Tin tức | CaraVeso',
    loadComponent: () => import('./news-list.component').then((m) => m.NewsListComponent),
  },
  {
    path: ':slug',
    loadComponent: () => import('./news-detail.component').then((m) => m.NewsDetailComponent),
  },
];
