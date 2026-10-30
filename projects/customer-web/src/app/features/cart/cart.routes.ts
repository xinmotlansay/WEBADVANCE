import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { CartComponent } from './cart.component';

export const CART_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: CartComponent,
    title: 'Giỏ hàng | CaraVeso',
    data: { layout: 'solid' },
  },
];
