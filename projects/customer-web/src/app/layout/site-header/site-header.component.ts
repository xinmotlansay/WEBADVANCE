import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../../core/cart/cart.service';
import { AccountReadApiService } from '../../features/account/account-read-api.service';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.css'
})
export class SiteHeaderComponent {
  protected readonly accountProfile;

  constructor(protected readonly cart: CartService, accountApi: AccountReadApiService) {
    this.accountProfile = accountApi.profile;
  }
}
