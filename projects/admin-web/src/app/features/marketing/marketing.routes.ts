import { Routes } from '@angular/router';
import type { CollectionFormComponent } from './collections/collection-form.component';

const leaveForm = (c: CollectionFormComponent) => c.canLeave();

export const MARKETING_ROUTES: Routes = [
  {
    path: 'khuyen-mai',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./promotions/promotion-list.component').then((m) => m.PromotionListComponent),
      },
      {
        path: 'tao-moi',
        loadComponent: () =>
          import('./promotions/promotion-form.component').then((m) => m.PromotionFormComponent),
      },
      {
        path: ':id/sua',
        loadComponent: () =>
          import('./promotions/promotion-form.component').then((m) => m.PromotionFormComponent),
      },
    ],
  },
  {
    path: 'ma-giam-gia',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./vouchers/voucher-list.component').then((m) => m.VoucherListComponent),
      },
      {
        path: 'tao-moi',
        loadComponent: () =>
          import('./vouchers/voucher-form.component').then((m) => m.VoucherFormComponent),
      },
      {
        path: ':id/sua',
        loadComponent: () =>
          import('./vouchers/voucher-form.component').then((m) => m.VoucherFormComponent),
      },
    ],
  },
  {
    path: 'khach-hang-rui-ro',
    loadComponent: () =>
      import('./risk/risk-customers.component').then((m) => m.RiskCustomersComponent),
  },
  {
    path: 'banner',
    children: [
      {
        path: '',
        loadComponent: () => import('./banners/banner-list.component').then((m) => m.BannerListComponent),
      },
      {
        path: 'tao-moi',
        loadComponent: () => import('./banners/banner-form.component').then((m) => m.BannerFormComponent),
      },
      {
        path: ':id/sua',
        loadComponent: () => import('./banners/banner-form.component').then((m) => m.BannerFormComponent),
      },
    ],
  },
  {
    path: 'bai-viet',
    children: [
      {
        path: '',
        loadComponent: () => import('./articles/article-list.component').then((m) => m.ArticleListComponent),
      },
      {
        path: 'tao-moi',
        loadComponent: () => import('./articles/article-form.component').then((m) => m.ArticleFormComponent),
      },
      {
        path: ':id/sua',
        loadComponent: () => import('./articles/article-form.component').then((m) => m.ArticleFormComponent),
      },
    ],
  },
  {
    path: 'noi-dung',
    children: [
      {
        path: '',
        loadComponent: () => import('./content/content-page.component').then((m) => m.ContentPageComponent),
      },
      {
        path: 'lp/:slug',
        loadComponent: () => import('./content/content-page.component').then((m) => m.ContentPageComponent),
      },
    ],
  },
  {
    path: 'collection',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./collections/collection-list.component').then((m) => m.CollectionListComponent),
      },
      {
        path: 'tao-moi',
        canDeactivate: [leaveForm],
        loadComponent: () =>
          import('./collections/collection-form.component').then((m) => m.CollectionFormComponent),
      },
      {
        path: ':id/sua',
        canDeactivate: [leaveForm],
        loadComponent: () =>
          import('./collections/collection-form.component').then((m) => m.CollectionFormComponent),
      },
    ],
  },
];
