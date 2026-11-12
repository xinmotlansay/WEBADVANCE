import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../../core/api-error';
import { AccountApiService, type AccountInvoice, type AccountOrder } from '../../../../services/account/account-api.service';
import { AccountIconComponent, type IconName } from '../../account-icon.component';
import { ToastService } from '../../../../services/ui/toast.service';

interface TrackingStep {
  label: string;
  icon: IconName;
  note: string;
  done: boolean;
}

interface RefundView {
  label: string;
  tone: 'pending' | 'active' | 'done';
  text: string;
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
  /** Đã thanh toán chuyển khoản: tiền hoàn về tài khoản đã chuyển, không cần khách nhập thêm. */
  refundToSourceBank: boolean;
  trackingTitle: string;
  tone: 'pending' | 'active' | 'done' | 'failed';
  filter: OrderFilter;
  paymentText: string;
  /** Trạng thái hoàn tiền của đơn đã hủy (chỉ khi đã thanh toán). */
  refund: RefundView | null;
  /** Hóa đơn điện tử của đơn đã giao, kèm dòng ghi chú về email hóa đơn. */
  invoice: { number: string; emailNote: string } | null;
  fees: { label: string; amount: number; discount?: boolean }[];
  items: { name: string; details: string; quantity: number; unitPrice: number; total: number; image: string }[];
  steps: TrackingStep[];
}

type OrderFilter = 'ALL' | 'PENDING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';

const FILTERS: { value: OrderFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xử lý' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'CANCELLED', label: 'Đã huỷ' },
];

const STATUS_GROUP: Record<string, { filter: OrderFilter; tone: OrderView['tone'] }> = {
  PENDING_PAYMENT: { filter: 'PENDING', tone: 'pending' },
  PENDING_CONFIRMATION: { filter: 'PENDING', tone: 'pending' },
  CONFIRMED: { filter: 'PENDING', tone: 'active' },
  HANDED_OVER: { filter: 'SHIPPING', tone: 'active' },
  SHIPPING: { filter: 'SHIPPING', tone: 'active' },
  DELIVERED: { filter: 'DELIVERED', tone: 'done' },
  DELIVERY_FAILED: { filter: 'SHIPPING', tone: 'failed' },
  RETURNING: { filter: 'SHIPPING', tone: 'failed' },
  CANCELLED: { filter: 'CANCELLED', tone: 'failed' },
};

const METHOD_LABEL: Record<string, string> = { COD: 'Thanh toán khi nhận hàng', BANK_TRANSFER: 'Chuyển khoản' };
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  DEPOSITED: 'Đã đặt cọc',
  PAID: 'Đã thanh toán',
  UNPAID: 'Chưa thanh toán',
  FAILED: 'Thanh toán thất bại',
  REFUND_PENDING: 'Chờ hoàn tiền',
  REFUNDING: 'Đang hoàn tiền',
  REFUNDED: 'Đã hoàn tiền',
};

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

@Component({
  selector: 'app-orders',
  imports: [FormsModule, RouterLink, AccountIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent {
  private readonly api = inject(AccountApiService);

  protected readonly orders = signal<OrderView[]>([]);
  protected readonly filters = FILTERS;
  protected readonly filter = signal<OrderFilter>('ALL');
  protected readonly visibleOrders = computed(() => {
    const filter = this.filter();
    return filter === 'ALL' ? this.orders() : this.orders().filter((order) => order.filter === filter);
  });
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly cancelling = signal(false);
  protected readonly downloadingInvoice = signal(false);
  protected readonly expandedOrder = signal('');
  protected readonly detailOrder = signal<OrderView | null>(null);
  protected readonly cancellingOrder = signal('');
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected cancelReason = '';
  protected readonly cancelReasons = [
    'Muốn thay đổi địa chỉ giao hàng',
    'Muốn thay đổi sản phẩm trong đơn',
    'Tìm thấy giá tốt hơn ở nơi khác',
    'Thời gian giao hàng quá lâu',
    'Đổi ý, không muốn mua nữa',
  ];

  private readonly focusOrderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';

  constructor() {
    this.loadOrders();
  }

  protected toggleTracking(order: OrderView): void {
    this.expandedOrder.update((id) => (id === order.id ? '' : order.id));
  }

  protected openCancel(order: OrderView): void {
    this.cancellingOrder.set(order.id);
    this.cancelReason = '';
  }

  protected confirmCancel(order: OrderView): void {
    if (!this.cancelReason) return this.showNotice('Vui lòng chọn lý do huỷ đơn.', true);
    this.cancelling.set(true);
    this.api
      .cancelOrder(order.id, { reason: this.cancelReason })
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.cancellingOrder.set('');
          this.showNotice(`Đã huỷ đơn #${order.code}.`);
          this.loadOrders();
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.showNotice(apiErrorMessage(error), true);
        },
      });
  }

  protected formatPrice(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  private loadOrders(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.orders().subscribe({
      next: (orders) => {
        this.orders.set(orders.map((order) => this.toOrderView(order)));
        if (this.focusOrderId && orders.some((order) => order.id === this.focusOrderId)) {
          this.expandedOrder.set(this.focusOrderId);
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private toRefundView(order: AccountOrder): RefundView | null {
    const refund = order.refund;
    if (!refund) return null;
    const amount = `${this.formatPrice(refund.amount)}đ`;
    const destination =
      refund.refundTo === 'CUSTOMER_ACCOUNT'
        ? 'tài khoản bạn đã cung cấp'
        : 'tài khoản ngân hàng bạn đã dùng để thanh toán';
    if (refund.status === 'COMPLETED') {
      const at = refund.completedAt ? ` lúc ${this.formatDate(refund.completedAt)}` : '';
      return { label: 'Đã hoàn tiền', tone: 'done', text: `Đã hoàn ${amount} về ${destination}${at}.` };
    }
    if (refund.status === 'PROCESSING') {
      return {
        label: 'Đang hoàn tiền',
        tone: 'active',
        text: `CaraVeso đang chuyển hoàn ${amount} về ${destination}. Thời gian tiền về theo quy định của ngân hàng.`,
      };
    }
    return {
      label: 'Chờ hoàn tiền',
      tone: 'pending',
      text: `CaraVeso đã nhận yêu cầu hoàn ${amount} về ${destination}.`,
    };
  }

  /** Tải PDF hóa đơn qua API có đăng nhập, rồi lưu thành file trên máy khách. */
  protected downloadInvoice(order: OrderView): void {
    if (!order.invoice) return;
    const number = order.invoice.number;
    this.downloadingInvoice.set(true);
    this.api.downloadInvoice(order.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `HoaDon-${number}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        this.downloadingInvoice.set(false);
      },
      error: () => {
        this.downloadingInvoice.set(false);
        this.toast.error('Không tải được hóa đơn, vui lòng thử lại sau.');
      },
    });
  }

  private invoiceView(order: AccountOrder): OrderView['invoice'] {
    const invoice = order.invoice;
    if (!invoice) return null;
    const email = order.invoiceInfo?.email ?? invoice.emailedTo ?? '';
    const emailNote: Record<AccountInvoice['emailStatus'], string> = {
      SENT: `Đã gửi qua email tới ${invoice.emailedTo}.`,
      PENDING: `Đang gửi qua email tới ${email}.`,
      FAILED: `Chưa gửi được email tới ${email}. Bạn vẫn có thể tải hóa đơn bên dưới.`,
      NOT_REQUESTED: 'Hóa đơn không gửi qua email. Bạn có thể tải file PDF bên dưới.',
    };
    return { number: invoice.invoiceNumber, emailNote: emailNote[invoice.emailStatus] };
  }

  private toOrderView(order: AccountOrder): OrderView {
    const view = STATUS_VIEW[order.status] ?? { label: order.status, icon: 'clock' as IconName };
    const lastChange = order.statusHistory.at(-1)?.changedAt ?? order.createdAt;
    return {
      id: order.id,
      code: order.orderCode,
      date: this.formatDate(order.createdAt),
      status: view.label,
      statusIcon: view.icon,
      tone: STATUS_GROUP[order.status]?.tone ?? 'pending',
      filter: STATUS_GROUP[order.status]?.filter ?? 'PENDING',
      paymentText: `${METHOD_LABEL[order.payment.method] ?? order.payment.method} · ${PAYMENT_STATUS_LABEL[order.payment.status] ?? order.payment.status}`,
      refund: this.toRefundView(order),
      invoice: this.invoiceView(order),
      fees: [
        { label: 'Tạm tính', amount: order.subtotal ?? 0 },
        { label: 'Khuyến mãi', amount: order.promotionDiscount ?? 0, discount: true },
        { label: 'Voucher', amount: order.voucherDiscount ?? 0, discount: true },
        { label: 'Phí vận chuyển', amount: order.shippingFee ?? 0 },
        { label: 'Phí lắp đặt', amount: order.installationFee ?? 0 },
        { label: 'Trừ giá trị hàng đã đổi', amount: order.exchangeCredit ?? 0, discount: true },
      ].filter((fee) => fee.amount > 0),
      total: order.totalAmount,
      delivered: order.status === 'DELIVERED',
      cancellable: order.allowedActions.canCancel,
      refundToSourceBank: ['PAID', 'DEPOSITED'].includes(order.payment.status),
      trackingTitle:
        order.status === 'DELIVERED'
          ? `Đã giao vào ngày: ${this.formatDate(order.shipment?.actualDeliveryDate ?? lastChange)}`
          : order.status === 'CANCELLED'
            ? `Đã huỷ vào ngày: ${this.formatDate(order.cancellation?.cancelledAt ?? lastChange)}`
            : `Trạng thái hiện tại: ${view.label}`,
      items: order.items.map((item, index) => {
        const details = [item.snapshot.color, item.snapshot.dimensions].filter(Boolean).join(', ');
        return {
          name: item.snapshot.name,
          details,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.finalAmount,
          image: order.thumbnails[index] ?? '',
        };
      }),
      steps: this.trackingSteps(order),
    };
  }

  private trackingSteps(order: AccountOrder): TrackingStep[] {
    const reachedAt = TRACKING_STEPS.map(
      (step, index) =>
        order.statusHistory.find((event) => step.statuses.includes(event.toStatus))?.changedAt ??
        (index === 0 ? order.createdAt : undefined),
    );
    const lastReached = reachedAt.reduce((last, date, index) => (date ? index : last), 0);
    const steps = TRACKING_STEPS.map((step, index) => ({
      label: step.label,
      icon: step.icon,
      note: reachedAt[index] ? step.note(this.formatDate(reachedAt[index], true)) : '',
      done: index <= lastReached,
    }));

    const endEvent = order.statusHistory.find((event) =>
      ['CANCELLED', 'DELIVERY_FAILED', 'RETURNING'].includes(event.toStatus),
    );
    if (!endEvent) return steps;
    const reason = order.cancellation?.reason ? ` · Lý do: ${order.cancellation.reason}` : '';
    return [
      ...steps.slice(0, lastReached + 1),
      {
        label: STATUS_VIEW[endEvent.toStatus]?.label ?? '',
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
    return new Intl.DateTimeFormat(
      'vi-VN',
      short ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' },
    ).format(date);
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
}
