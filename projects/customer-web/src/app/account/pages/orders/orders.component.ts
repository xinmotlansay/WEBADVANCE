import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountReadApiService, MongoCustomerOrder } from '../../../features/account/account-read-api.service';
import { IconComponent, IconName } from '../../../shared/icon/icon.component';

interface TrackingStep {
  label: string;
  icon: IconName;
  note: string;
  done: boolean;
}

interface OrderView {
  id: string;
  code: string;
  date: string;
  status: string;
  statusIcon: IconName;
  total: number;
  delivered: boolean;
  cancellable: boolean;
  trackingTitle: string;
  items: { name: string; details: string; total: number }[];
  steps: TrackingStep[];
}

const STATUS_VIEW: Record<string, { label: string; icon: IconName }> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', icon: 'clock' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', icon: 'clock' },
  CONFIRMED: { label: 'Đã xác nhận', icon: 'clipboard-check' },
  HANDED_OVER: { label: 'Đang giao hàng', icon: 'truck' },
  SHIPPING: { label: 'Đang giao hàng', icon: 'truck' },
  DELIVERED: { label: 'Giao thành công', icon: 'package' },
  DELIVERY_FAILED: { label: 'Giao thất bại', icon: 'x-circle' },
  RETURNING: { label: 'Đang hoàn hàng', icon: 'truck' },
  CANCELLED: { label: 'Đã huỷ', icon: 'x-circle' },
};

// Các mốc theo dõi đơn hiển thị trong Figma, mỗi mốc ứng với một hoặc nhiều trạng thái đơn.
const TRACKING_STEPS: { label: string; icon: IconName; statuses: string[]; note: (date: string) => string }[] = [
  { label: 'Chờ xác nhận', icon: 'clock', statuses: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION'], note: () => '' },
  { label: 'Đã xác nhận', icon: 'clipboard-check', statuses: ['CONFIRMED'], note: (date) => `Đã xác nhận vào ${date}` },
  { label: 'Đang giao hàng', icon: 'truck', statuses: ['HANDED_OVER', 'SHIPPING'], note: (date) => `Đã giao cho đơn vị vận chuyển vào ${date}` },
  { label: 'Giao hàng thành công', icon: 'package', statuses: ['DELIVERED'], note: (date) => `Đã giao cho bạn vào ${date}` },
];

const CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION'];

@Component({
  selector: 'app-orders',
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent {
  protected readonly orders = signal<OrderView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly needsAccountId = signal(false);
  protected readonly cancelling = signal(false);
  protected expandedOrder = '';
  protected cancellingOrder = '';
  protected cancelReason = '';
  protected notice = '';
  protected noticeIsError = false;
  protected readonly cancelReasons = [
    'Muốn thay đổi địa chỉ giao hàng',
    'Muốn thay đổi sản phẩm trong đơn',
    'Tìm thấy giá tốt hơn ở nơi khác',
    'Thời gian giao hàng quá lâu',
    'Đổi ý, không muốn mua nữa',
  ];
  private readonly userId: string;

  constructor(private readonly accountApi: AccountReadApiService) {
    this.userId = accountApi.getPreviewUserId();
    if (!this.userId) {
      this.needsAccountId.set(true);
      return;
    }
    this.loadOrders();
  }

  protected toggleTracking(order: OrderView): void {
    this.expandedOrder = this.expandedOrder === order.id ? '' : order.id;
  }

  protected openCancel(order: OrderView): void {
    this.cancellingOrder = this.cancellingOrder === order.id ? '' : order.id;
    this.cancelReason = '';
  }

  protected confirmCancel(order: OrderView): void {
    if (!this.cancelReason) {
      this.notice = 'Vui lòng chọn lý do huỷ đơn.';
      this.noticeIsError = true;
      return;
    }
    this.cancelling.set(true);
    this.accountApi.cancelOrder(this.userId, order.id, this.cancelReason).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.cancellingOrder = '';
        this.notice = `Đã huỷ đơn #${order.code}.`;
        this.noticeIsError = false;
        this.loadOrders();
      },
      error: (error: unknown) => {
        this.cancelling.set(false);
        this.notice = this.apiErrorMessage(error);
        this.noticeIsError = true;
      },
    });
  }

  protected formatPrice(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  private loadOrders(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.accountApi.getOrders(this.userId).subscribe({
      next: (orders) => {
        this.orders.set(orders.map((order) => this.toOrderView(order)));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(this.apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private toOrderView(order: MongoCustomerOrder): OrderView {
    const status = order.status ?? '';
    const view = STATUS_VIEW[status] ?? { label: status, icon: 'clock' as IconName };
    const history = order.statusHistory ?? [];
    const lastChange = history.at(-1)?.changedAt ?? order.createdAt;
    return {
      id: order._id,
      code: order.orderCode || order._id,
      date: this.formatDate(order.createdAt),
      status: view.label,
      statusIcon: view.icon,
      total: order.totalAmount ?? 0,
      delivered: status === 'DELIVERED',
      cancellable: CANCELLABLE_STATUSES.includes(status),
      trackingTitle: status === 'DELIVERED'
        ? `Đã giao vào ngày: ${this.formatDate(lastChange)}`
        : status === 'CANCELLED'
          ? `Đã huỷ vào ngày: ${this.formatDate(order.cancellation?.cancelledAt ?? lastChange)}`
          : `Trạng thái hiện tại: ${view.label}`,
      items: (order.items ?? []).map((item) => {
        const details = [item.snapshot?.color, item.snapshot?.dimensions].filter(Boolean).join(', ');
        const quantity = item.quantity ?? 1;
        return {
          name: item.snapshot?.name || 'Sản phẩm',
          details: quantity > 1 ? `${details}${details ? ' · ' : ''}SL: ${quantity}` : details,
          total: item.finalAmount ?? (item.unitPrice ?? 0) * quantity,
        };
      }),
      steps: this.trackingSteps(order),
    };
  }

  private trackingSteps(order: MongoCustomerOrder): TrackingStep[] {
    const history = order.statusHistory ?? [];
    const reachedAt = TRACKING_STEPS.map((step, index) =>
      history.find((event) => step.statuses.includes(event.toStatus ?? ''))?.changedAt
        ?? (index === 0 ? order.createdAt : undefined));
    const lastReached = reachedAt.reduce((last, date, index) => (date ? index : last), 0);
    const steps = TRACKING_STEPS.map((step, index) => ({
      label: step.label,
      icon: step.icon,
      note: reachedAt[index] ? step.note(this.formatDate(reachedAt[index], true)) : '',
      done: index <= lastReached,
    }));

    const endEvent = history.find((event) => ['CANCELLED', 'DELIVERY_FAILED', 'RETURNING'].includes(event.toStatus ?? ''));
    if (!endEvent) return steps;
    const reason = order.cancellation?.reason ? ` · Lý do: ${order.cancellation.reason}` : '';
    return [
      ...steps.slice(0, lastReached + 1),
      {
        label: STATUS_VIEW[endEvent.toStatus ?? '']?.label ?? '',
        icon: 'x-circle',
        note: `Cập nhật vào ${this.formatDate(endEvent.changedAt, true)}${endEvent.toStatus === 'CANCELLED' ? reason : ''}`,
        done: true,
      },
    ];
  }

  private formatDate(value?: string, short = false): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', short
      ? { day: '2-digit', month: '2-digit' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Không kết nối được MongoDB API. Hãy kiểm tra server ở cổng 3002.';
      if (typeof error.error?.message === 'string') return error.error.message;
      if (error.status === 404) return 'Không tìm thấy tài khoản trong MongoDB.';
    }
    return error instanceof Error ? error.message : 'Không tải được đơn hàng từ MongoDB.';
  }
}
