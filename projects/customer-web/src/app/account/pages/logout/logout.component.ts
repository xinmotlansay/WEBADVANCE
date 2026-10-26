import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountReadApiService } from '../../../features/account/account-read-api.service';

@Component({
  selector: 'app-logout',
  imports: [RouterLink],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.css',
})
export class LogoutComponent {
  protected confirmed = false;

  constructor(private readonly accountApi: AccountReadApiService) {}

  protected confirmLogout(): void {
    // Chưa có phiên đăng nhập thật: bỏ tài khoản đang chọn khỏi sessionStorage.
    this.accountApi.clearPreviewUser();
    this.confirmed = true;
  }
}
