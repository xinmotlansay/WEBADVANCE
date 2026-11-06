import { Routes } from '@angular/router';

/** Mọi trang chính sách dùng chung một component; nội dung do Admin cấp cao nhập trong Cấu hình hệ thống. */
export const POLICIES_ROUTES: Routes = [
  {
    path: ':slug',
    loadComponent: () => import('./policy.component').then((m) => m.PolicyComponent),
  },
];
