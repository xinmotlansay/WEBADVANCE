import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { apiErrorMessage } from '../../../../core/api-error';
import { ConfirmService } from '../../../../services/ui/confirm.service';
import { AccountApiService, type AccountAddress, type AddressInput } from '../../../../services/account/account-api.service';
import { AccountIconComponent } from '../../account-icon.component';
import { ToastService } from '../../../../services/ui/toast.service';

/** `public/data/vn-units.json`: 34 tỉnh/thành và phường/xã sau sáp nhập 2025, không còn cấp huyện. */
interface VnUnits {
  provinces: { name: string; wards: string[] }[];
}

@Component({
  selector: 'app-addresses',
  imports: [FormsModule, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.css',
})
export class AddressesComponent {
  private readonly api = inject(AccountApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly http = inject(HttpClient);

  protected readonly units = toSignal(
    this.http.get<VnUnits>('/data/vn-units.json').pipe(catchError(() => of<VnUnits>({ provinces: [] }))),
  );
  protected readonly provinceText = signal('');
  protected readonly wards = computed(
    () => this.units()?.provinces.find((p) => p.name === this.provinceText())?.wards ?? [],
  );
  /** Tỉnh đang chọn có nằm trong danh sách không (địa chỉ cũ có thể ghi tên tỉnh theo cách khác). */
  protected readonly provinceKnown = computed(() =>
    !!this.units()?.provinces.some((p) => p.name === this.provinceText()),
  );

  protected readonly addresses = signal<AccountAddress[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingAddressId = signal('');
  protected readonly editingDefault = signal(false);
  protected form: Required<AddressInput> = this.emptyAddress();

  constructor() {
    this.loadAddresses();
  }

  protected openForm(address?: AccountAddress): void {
    this.editingAddressId.set(address?.id ?? '');
    this.editingDefault.set(address?.isDefault ?? false);
    this.form = address
      ? {
          recipientName: address.recipientName,
          recipientPhone: address.recipientPhone,
          addressLine: address.addressLine,
          ward: address.ward,
          district: '',
          province: address.province,
          isDefault: address.isDefault,
        }
      : { ...this.emptyAddress(), isDefault: this.addresses().length === 0 };
    this.provinceText.set(this.form.province);
    this.formOpen.set(true);
    this.notice.set(null);
  }

  /** Đổi tỉnh thì phường/xã cũ không còn hợp lệ. */
  protected onProvinceChange(value: string): void {
    this.form.province = value;
    this.provinceText.set(value.trim());
    if (!this.wards().includes(this.form.ward)) this.form.ward = '';
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingAddressId.set('');
  }

  protected saveAddress(): void {
    if (this.saving()) return;
    const required = [this.form.recipientName, this.form.recipientPhone, this.form.addressLine, this.form.ward, this.form.province];
    if (required.some((value) => !value.trim())) {
      return this.showNotice('Vui lòng nhập đầy đủ các trường bắt buộc (*).', true);
    }
    const provinces = this.units()?.provinces ?? [];
    if (provinces.length) {
      const province = provinces.find((p) => p.name === this.form.province.trim());
      if (!province) return this.showNotice('Vui lòng chọn Tỉnh / thành phố trong danh sách gợi ý.', true);
      if (!province.wards.includes(this.form.ward.trim())) {
        return this.showNotice('Vui lòng chọn Phường / xã thuộc tỉnh đã chọn.', true);
      }
    }
    const phone = this.form.recipientPhone.replace(/[\s.-]/g, '');
    if (!/^(0|\+84)\d{9}$/.test(phone)) {
      return this.showNotice('Số điện thoại cần 10 số, bắt đầu bằng 0.', true);
    }

    const body: AddressInput = {
      ...this.form,
      recipientPhone: phone,
      province: this.form.province.trim(),
      ward: this.form.ward.trim(),
      district: undefined,
    };
    const id = this.editingAddressId();
    this.saving.set(true);
    (id ? this.api.updateAddress(id, body) : this.api.createAddress(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.showNotice(id ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ mới.');
        this.closeForm();
        this.loadAddresses();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected async deleteAddress(): Promise<void> {
    const id = this.editingAddressId();
    if (!id) return;
    const ok = await this.confirm.ask({
      title: 'Xoá địa chỉ',
      message: 'Bạn chắc chắn muốn xoá địa chỉ này?',
      confirmText: 'Xoá',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.deleteAddress(id).subscribe({
      next: () => {
        this.saving.set(false);
        this.showNotice('Đã xoá địa chỉ.');
        this.closeForm();
        this.loadAddresses();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showNotice(apiErrorMessage(error), true);
      },
    });
  }

  protected formatAddress(address: AccountAddress): string {
    return [address.addressLine, address.ward, address.province].filter(Boolean).join(', ');
  }

  private loadAddresses(): void {
    this.loading.set(true);
    this.api.addresses().subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private readonly toast = inject(ToastService);

  /** Thành công hiện toast ở đầu trang rồi tự mất; lỗi vẫn giữ lại trên trang. */
  private showNotice(text: string, error = false): void {
    if (error) {
      this.notice.set({ text, error });
      return;
    }
    this.notice.set(null);
    this.toast.success(text);
  }

  private emptyAddress(): Required<AddressInput> {
    return { recipientName: '', recipientPhone: '', addressLine: '', ward: '', district: '', province: '', isDefault: false };
  }
}
