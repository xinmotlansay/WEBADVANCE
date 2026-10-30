import { Routes } from '@angular/router';
import { CheckoutComponent } from './checkout.component';
import { PaymentComponent } from './payment/payment.component';
import { SuccessComponent } from './success/success.component';

export const CHECKOUT_ROUTES: Routes = [
  {
    path: '',
    component: CheckoutComponent,
    title: 'Thanh toán | CaraVeso',
    data: { layout: 'compact' },
  },
  {
    path: 'payment/:orderId',
    component: PaymentComponent,
    title: 'Thanh toán QR | CaraVeso',
    data: { layout: 'compact' },
  },
  {
    path: 'success/:orderId',
    component: SuccessComponent,
    title: 'Đặt hàng thành công | CaraVeso',
    data: { layout: 'compact' },
  },
];
