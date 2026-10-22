import { Routes } from '@angular/router';
import { CartComponent } from './cart.component';

export const CART_ROUTES: Routes = [
  {
    path: '',
    component: CartComponent,
    title: 'Giỏ hàng | CaraVeso',
    data: { layout: 'solid' },
  },
];
