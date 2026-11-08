import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../../../../core/api-error';
import { AccountApiService, type AccountVoucher } from '../../../../services/account/account-api.service';
import { ToastService } from '../../../../services/ui/toast.service';

type VoucherFilter = 'Tất cả' | 'Có thể sử dụng' | 'Đã sử dụng' | 'Hết hạn';
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

interface VoucherView {
  id: string;
  code: string;
  title: string;
  value: string;
  condition: string;
  expiry: string;
  status: 'Có thể sử dụng' | 'Sắp hết hạn' | 'Đã sử dụng' | 'Hết hạn';
}

const money = (value: number) => `${value.toLocaleString('vi-VN')} VNĐ`;

@Component({
  selector: 'app-vouchers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vouchers.component.html',
  styleUrl: './vouchers.component.css',
})
export class VouchersComponent {
  private readonly toast = inject(ToastService);
  private readonly api = inject(AccountApiService);

  protected readonly vouchers = signal<VoucherView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly notice = signal('');
  protected readonly filter = signal<VoucherFilter>('Tất cả');
  protected readonly filters: VoucherFilter[] = ['Tất cả', 'Có thể sử dụng', 'Đã sử dụng', 'Hết hạn'];

  protected readonly filteredVouchers = computed(() => {
    const filter = this.filter();
    const all = this.vouchers();
    if (filter === 'Tất cả') return all;
    if (filter === 'Có thể sử dụng') {
      return all.filter((v) => v.status === 'Có thể sử dụng' || v.status === 'Sắp hết hạn');
    }
    return all.filter((v) => v.status === filter);
  });

  constructor() {
    this.api.vouchers().subscribe({
      next: (vouchers) => {
        this.vouchers.set(vouchers.map((voucher) => this.toView(voucher)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected isUnavailable(voucher: VoucherView): boolean {
    return voucher.status === 'Đã sử dụng' || voucher.status === 'Hết hạn';
  }

  protected showCondition(voucher: VoucherView): void {
    this.toast.success(`Điều kiện áp dụng: ${voucher.condition}`);
  }

  /** Mã nhập ở bước thanh toán; ở đây chỉ nhắc khách mã cần dùng. */
  protected useVoucher(voucher: VoucherView): void {
    this.toast.success(`Nhập mã ${voucher.code} ở bước thanh toán để được giảm giá.`);
  }

  private toView(voucher: AccountVoucher): VoucherView {
    const expiresAt = new Date(voucher.expiresAt).getTime();
    const status: VoucherView['status'] =
      voucher.status === 'USED'
        ? 'Đã sử dụng'
        : voucher.status === 'EXPIRED'
          ? 'Hết hạn'
          : expiresAt - Date.now() < EXPIRING_SOON_MS
            ? 'Sắp hết hạn'
            : 'Có thể sử dụng';
    const conditions = [
      voucher.minOrderValue ? `Đơn hàng từ ${money(voucher.minOrderValue)}` : '',
      voucher.discountType === 'PERCENT' && voucher.maxDiscountValue ? `Tối đa ${money(voucher.maxDiscountValue)}` : '',
    ].filter(Boolean);
    return {
      id: voucher.id,
      code: voucher.code,
      title: voucher.name,
      value: voucher.discountType === 'PERCENT' ? `Giảm ${voucher.discountValue}%` : money(voucher.discountValue),
      condition: conditions.length ? conditions.join(' · ') : 'Áp dụng cho mọi đơn hàng.',
      expiry: new Intl.DateTimeFormat('vi-VN').format(new Date(voucher.expiresAt)),
      status,
    };
  }
}
