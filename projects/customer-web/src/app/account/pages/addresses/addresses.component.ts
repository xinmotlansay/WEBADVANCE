import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountReadApiService, MongoCustomerAddress } from '../../../features/account/account-read-api.service';

interface AddressView extends MongoCustomerAddress {
  label: string;
}

@Component({
  selector: 'app-addresses',
  imports: [FormsModule, RouterLink],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.css',
})
export class AddressesComponent {
  protected readonly addresses = signal<AddressView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected notice = '';
  protected addressFormOpen = false;
  protected savingAddress = false;
  protected editingAddressId = '';
  protected addressForm = this.emptyAddress();
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) {
      this.needsAccountId.set(true);
      return;
    }

    this.loadAddresses();
  }

  protected requestEdit(address?: AddressView): void {
    this.editingAddressId = address?._id ?? '';
    this.addressForm = address ? {
      recipientName: address.recipientName ?? '',
      recipientPhone: address.recipientPhone ?? '',
      addressLine: address.addressLine ?? '',
      ward: address.ward ?? '',
      district: address.district ?? '',
      province: address.province ?? '',
      isDefault: address.isDefault ?? false,
    } : this.emptyAddress();
    this.addressFormOpen = true;
    this.notice = '';
  }

  protected saveAddress(): void {
    if (!this.userId || this.savingAddress) return;
    this.savingAddress = true;
    this.notice = '';
    const request = this.editingAddressId
      ? this.accountApi.updateAddress(this.userId, this.editingAddressId, this.addressForm)
      : this.accountApi.createAddress(this.userId, this.addressForm);
    request.subscribe({
      next: () => {
        this.savingAddress = false;
        this.addressFormOpen = false;
        this.notice = 'Địa chỉ đã được lưu vào MongoDB.';
        this.loadAddresses();
      },
      error: (error: unknown) => {
        this.savingAddress = false;
        this.notice = this.apiErrorMessage(error);
      },
    });
  }

  protected cancelAddress(): void {
    this.addressFormOpen = false;
    this.editingAddressId = '';
  }

  protected formatAddress(address: AddressView): string {
    return [address.addressLine, address.ward, address.district, address.province].filter((part) => !!part).join(', ');
  }

  private loadAddresses(): void {
    this.loading.set(true);
    this.accountApi.getAddresses(this.userId).subscribe({
      next: (addresses) => {
        this.addresses.set(addresses.map((address) => ({ ...address, label: 'Nhà riêng' })));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private emptyAddress(): Omit<MongoCustomerAddress, '_id'> & { district: string } {
    return {
      recipientName: '',
      recipientPhone: '',
      addressLine: '',
      ward: '',
      district: '',
      province: '',
      isDefault: false,
    };
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
