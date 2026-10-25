import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerAddress } from '../../../features/account/account.service';
import { AccountReadApiService } from '../../../features/account/account-read-api.service';

@Component({
  selector: 'app-addresses',
  imports: [RouterLink],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.css',
})
export class AddressesComponent {
  protected readonly addresses = signal<CustomerAddress[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected notice = '';

  constructor(private readonly accountApi: AccountReadApiService) {
    const userId = accountApi.getPreviewUserId();
    if (!userId) {
      this.needsAccountId.set(true);
      return;
    }

    this.loading.set(true);
    accountApi.getAddresses(userId).subscribe({
      next: (addresses) => {
        this.addresses.set(addresses.map((address, index) => ({
          id: index + 1,
          recipient: address.recipientName ?? '',
          phone: address.recipientPhone ?? '',
          detail: [address.addressLine, address.ward, address.province].filter(Boolean).join(', '),
          label: 'Nhà riêng',
          isDefault: address.isDefault ?? false,
        })));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected requestEdit(): void {
    this.notice = 'Demo chỉ đọc: API chưa hỗ trợ chỉnh sửa hoặc thêm địa chỉ.';
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (error.status === 400) return 'MongoDB _id không hợp lệ. Hãy nhập lại trong mục Tài khoản của tôi.';
      if (error.status === 404) return 'Không tìm thấy tài khoản trong MongoDB.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không tải được địa chỉ từ MongoDB.';
  }
}
