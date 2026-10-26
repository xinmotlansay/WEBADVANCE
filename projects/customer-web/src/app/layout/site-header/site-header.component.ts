import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../../core/cart/cart.service';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.css'
})
export class SiteHeaderComponent {
  constructor(protected readonly cart: CartService) {
    cart.refresh();
  }
}
