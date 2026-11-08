import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AdminChatApi } from './services/api/admin-chat.service';
import { AdminCustomerApi } from './services/api/admin-customer.service';
import { AdminDashboardApi, AdminReportApi } from './services/api/admin-dashboard.service';
import { AdminOrderApi } from './services/api/admin-order.service';
import { AdminPaymentApi } from './services/api/admin-payment.service';
import { AdminReturnApi } from './services/api/admin-return.service';
import { AdminWarrantyApi } from './services/api/admin-warranty.service';
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
import { AdminAuthService } from './services/auth/admin-auth.service';
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
