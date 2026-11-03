import { Routes } from '@angular/router';

export const MARKETING_ROUTES: Routes = [
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
