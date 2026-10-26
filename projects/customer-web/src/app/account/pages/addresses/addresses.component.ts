import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountReadApiService, AddressInput, MongoCustomerAddress } from '../../../features/account/account-read-api.service';
import { IconComponent } from '../../../shared/icon/icon.component';

@Component({
  selector: 'app-addresses',
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.css',
})
export class AddressesComponent {
  protected readonly addresses = signal<MongoCustomerAddress[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected notice = '';
  protected noticeIsError = false;
  protected formOpen = false;
  protected editingAddressId = '';
  protected editingDefault = false;
  protected form: Required<AddressInput> = this.emptyAddress();
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) {
      this.needsAccountId.set(true);
      return;
    }
    this.loadAddresses();
  }

  protected openForm(address?: MongoCustomerAddress): void {
    this.editingAddressId = address?._id ?? '';
    this.editingDefault = address?.isDefault ?? false;
    this.form = address ? {
      recipientName: address.recipientName ?? '',
      recipientPhone: address.recipientPhone ?? '',
      addressLine: address.addressLine ?? '',
      ward: address.ward ?? '',
      district: address.district ?? '',
      province: address.province ?? '',
      isDefault: address.isDefault ?? false,
    } : { ...this.emptyAddress(), isDefault: this.addresses().length === 0 };
    this.formOpen = true;
    this.notice = '';
  }

  protected closeForm(): void {
    this.formOpen = false;
    this.editingAddressId = '';
  }

  protected saveAddress(): void {
    if (this.saving()) return;
    const required = [this.form.recipientName, this.form.recipientPhone, this.form.addressLine, this.form.ward, this.form.province];
    if (required.some((value) => !value.trim())) {
      return this.showNotice('Vui lòng nhập đầy đủ các trường bắt buộc (*).', true);
    }
    if (!/^(0|\+?84)\d{9}$/.test(this.form.recipientPhone.replace(/[\s.-]/g, ''))) {
      return this.showNotice('Số điện thoại cần 10 số, bắt đầu bằng 0.', true);
    }

    this.saving.set(true);
    const request = this.editingAddressId
      ? this.accountApi.updateAddress(this.userId, this.editingAddressId, this.form)
      : this.accountApi.createAddress(this.userId, this.form);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showNotice(this.editingAddressId ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ mới.');
        this.closeForm();
        this.loadAddresses();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected deleteAddress(): void {
    if (!this.editingAddressId || !confirm('Bạn chắc chắn muốn xoá địa chỉ này?')) return;
    this.saving.set(true);
    this.accountApi.deleteAddress(this.userId, this.editingAddressId).subscribe({
      next: () => {
        this.saving.set(false);
        this.showNotice('Đã xoá địa chỉ.');
        this.closeForm();
        this.loadAddresses();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(this.apiErrorMessage(error), true);
      },
    });
  }

  protected formatAddress(address: MongoCustomerAddress): string {
    return [address.addressLine, address.ward, address.district, address.province].filter((part) => !!part).join(', ');
  }

  private loadAddresses(): void {
    this.loading.set(true);
    this.accountApi.getAddresses(this.userId).subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private showNotice(message: string, isError = false): void {
    this.notice = message;
    this.noticeIsError = isError;
  }

  private emptyAddress(): Required<AddressInput> {
    return { recipientName: '', recipientPhone: '', addressLine: '', ward: '', district: '', province: '', isDefault: false };
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status === 404) return 'Không tìm thấy tài khoản trong MongoDB.';
    }
    return error instanceof Error ? error.message : 'Không thực hiện được thao tác với địa chỉ.';
  }
}
