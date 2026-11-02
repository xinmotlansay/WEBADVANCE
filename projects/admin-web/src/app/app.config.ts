import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AdminChatApi } from './core/api/admin-chat.api';
import { AdminCustomerApi } from './core/api/admin-customer.api';
import { AdminDashboardApi, AdminReportApi } from './core/api/admin-dashboard.api';
import { AdminOrderApi } from './core/api/admin-order.api';
import { AdminPaymentApi } from './core/api/admin-payment.api';
import { AdminReturnApi } from './core/api/admin-return.api';
import { AdminWarrantyApi } from './core/api/admin-warranty.api';
import {
  HttpAdminChatApi,
  HttpAdminCustomerApi,
  HttpAdminDashboardApi,
  HttpAdminOrderApi,
  HttpAdminPaymentApi,
  HttpAdminReportApi,
  HttpAdminReturnApi,
  HttpAdminWarrantyApi,
} from './core/api/http/http-admin-api';
import { routes } from './app.routes';
import { AdminAuthService } from './core/auth/admin-auth.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AdminAuthService).restoreSession()),
    { provide: AdminOrderApi, useClass: HttpAdminOrderApi },
    { provide: AdminPaymentApi, useClass: HttpAdminPaymentApi },
    { provide: AdminReturnApi, useClass: HttpAdminReturnApi },
    { provide: AdminWarrantyApi, useClass: HttpAdminWarrantyApi },
    { provide: AdminCustomerApi, useClass: HttpAdminCustomerApi },
    { provide: AdminDashboardApi, useClass: HttpAdminDashboardApi },
    { provide: AdminReportApi, useClass: HttpAdminReportApi },
    { provide: AdminChatApi, useClass: HttpAdminChatApi },
  ],
};
