import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerVoucher } from '../../../features/account/account.service';
import { AccountReadApiService, MongoCustomerVoucher } from '../../../features/account/account-read-api.service';

@Component({
  selector: 'app-vouchers',
  imports: [RouterLink],
  templateUrl: './vouchers.component.html',
  styleUrl: './vouchers.component.css',
})
export class VouchersComponent {
  protected readonly vouchers = signal<CustomerVoucher[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected filter: CustomerVoucher['status'] | 'Tất cả' = 'Tất cả';
  protected notice = '';

  protected readonly filters: (CustomerVoucher['status'] | 'Tất cả')[] = ['Tất cả', 'Có thể sử dụng', 'Đã sử dụng', 'Hết hạn'];

  constructor(private readonly accountApi: AccountReadApiService) {
    const userId = accountApi.getPreviewUserId();
    if (!userId) {
      this.needsAccountId.set(true);
      return;
    }

    this.loading.set(true);
    accountApi.getVouchers(userId).subscribe({
      next: (vouchers) => {
        this.vouchers.set(vouchers.map((voucher) => this.toCustomerVoucher(voucher)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected filteredVouchers(): CustomerVoucher[] {
    if (this.filter === 'Tất cả') return this.vouchers();
    if (this.filter === 'Có thể sử dụng') {
      return this.vouchers().filter((voucher) => voucher.status === 'Có thể sử dụng' || voucher.status === 'Sắp hết hạn');
    }
    return this.vouchers().filter((voucher) => voucher.status === this.filter);
  }

  protected useVoucher(voucher: CustomerVoucher): void {
    if (voucher.status === 'Đã sử dụng' || voucher.status === 'Hết hạn') {
      this.notice = 'Voucher này không còn khả dụng.';
      return;
    }
    this.notice = `Đã chọn mã ${voucher.code}. Demo chỉ đọc; chưa ghi thay đổi vào MongoDB.`;
  }

  private toCustomerVoucher(record: MongoCustomerVoucher): CustomerVoucher {
    const voucher = record.voucher;
    const expiryDate = record.expiresAt || voucher?.endDate;
    const expiryTime = expiryDate ? new Date(expiryDate).getTime() : Number.NaN;
    const status: CustomerVoucher['status'] = record.status === 'USED' || record.status === 'REDEEMED'
      ? 'Đã sử dụng'
      : !voucher || voucher.status !== 'ACTIVE' || !Number.isFinite(expiryTime) || expiryTime < Date.now()
        ? 'Hết hạn'
        : expiryTime - Date.now() < 7 * 24 * 60 * 60 * 1000
          ? 'Sắp hết hạn'
          : 'Có thể sử dụng';
    const discount = voucher?.discountType === 'PERCENT'
      ? `Giảm ${voucher.discountValue ?? 0}%`
      : `${(voucher?.discountValue ?? 0).toLocaleString('vi-VN')} VNĐ`;

    return {
      id: record._id,
      code: voucher?.code ?? '—',
      title: voucher?.name ?? 'Voucher',
      value: discount,
      condition: voucher?.scope?.length ? voucher.scope.join(' · ') : 'Điều kiện áp dụng theo voucher.',
      expiry: this.formatDate(expiryDate),
      status,
    };
  }

  private formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN').format(date);
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (error.status === 400) return 'MongoDB _id không hợp lệ. Hãy nhập lại trong mục Tài khoản của tôi.';
      if (error.status === 404) return 'Không tìm thấy tài khoản trong MongoDB.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không tải được voucher từ MongoDB.';
  }
}
