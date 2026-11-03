import { Routes } from '@angular/router';

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
];
