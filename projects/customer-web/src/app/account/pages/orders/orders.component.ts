import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountOrder } from '../../../features/account/account.service';
import { AccountReadApiService, MongoCustomerOrder } from '../../../features/account/account-read-api.service';

@Component({
  selector: 'app-orders',
  imports: [CommonModule, RouterLink],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent {
  protected readonly orders = signal<AccountOrder[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected filter = 'Tất cả';
  protected expandedOrder = '';
  protected notice = '';

  protected readonly filters = ['Tất cả', 'Chờ xác nhận', 'Đang giao', 'Đã giao', 'Đã hủy'];

  constructor(private readonly accountApi: AccountReadApiService) {
    const userId = accountApi.getPreviewUserId();
    if (!userId) {
      this.needsAccountId.set(true);
      return;
    }
    this.loadOrders(userId);
  }

  private loadOrders(userId: string): void {
    this.loading.set(true);
    this.loadError.set('');
    this.accountApi.getOrders(userId).subscribe({
      next: (orders) => {
        const mappedOrders = orders.map((order) => this.toAccountOrder(order));
        this.orders.set(mappedOrders);
        this.expandedOrder = mappedOrders.find((order) => order.delivered)?.id ?? '';
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private toAccountOrder(order: MongoCustomerOrder): AccountOrder {
    const status = this.statusLabel(order.status ?? '');
    return {
      id: order.orderCode || order._id,
      date: this.formatDate(order.createdAt),
      status,
      total: order.totalAmount ?? 0,
      delivered: status === 'Giao hàng thành công',
      items: (order.items ?? []).map((item) => ({
        name: item.snapshot?.name || 'Sản phẩm',
        details: [item.snapshot?.color, item.snapshot?.dimensions].filter(Boolean).join(', '),
        quantity: item.quantity ?? 1,
        total: item.finalAmount ?? item.unitPrice ?? 0,
      })),
      history: (order.statusHistory ?? []).map((item) => ({
        status: this.statusLabel(item.toStatus ?? ''),
        date: this.formatDate(item.changedAt),
      })),
    };
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING_CONFIRMATION: 'Chờ xác nhận',
      PENDING_PAYMENT: 'Chờ thanh toán',
      CONFIRMED: 'Đã xác nhận',
      PROCESSING: 'Đang chuẩn bị',
      SHIPPING: 'Đang giao hàng',
      IN_TRANSIT: 'Đang giao hàng',
      DELIVERED: 'Giao hàng thành công',
      CANCELLED: 'Đã hủy',
    };
    return labels[status] ?? status;
  }

  private formatDate(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN').format(date);
  }

  protected formatPrice(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (error.status === 400) return 'MongoDB _id không hợp lệ. Hãy nhập lại trong mục Tài khoản của tôi.';
      if (error.status === 404) return 'Không tìm thấy tài khoản trong MongoDB.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return error instanceof Error ? error.message : 'Không tải được đơn hàng từ MongoDB.';
  }

  protected filteredOrders(): AccountOrder[] {
    if (this.filter === 'Tất cả') return this.orders();
    if (this.filter === 'Đã giao') return this.orders().filter((order) => order.delivered);
    if (this.filter === 'Đang giao') return this.orders().filter((order) => order.status === 'Đang giao hàng');
    return this.orders().filter((order) => order.status === this.filter);
  }

  protected cancelOrder(order: AccountOrder): void {
    this.notice = `Demo chỉ đọc: không gửi yêu cầu hủy đơn ${order.id} và không thay đổi dữ liệu MongoDB.`;
  }

  protected toggleTracking(order: AccountOrder): void {
    this.expandedOrder = this.expandedOrder === order.id ? '' : order.id;
  }
}
