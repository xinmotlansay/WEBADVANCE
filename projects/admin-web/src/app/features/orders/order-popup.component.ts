import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApiService, apiMessage, type OrderDetail } from '../../core/api/admin-api.service';
import { FORMAT_PIPES, formatDate, formatTime, formatVnd } from '../../shared/format';
import { DELIVERED_BY, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, toneClass } from '../../shared/status';
import { printDocument } from '../../shared/export';
import { DetailPopupComponent } from '../../shared/ui/detail-popup.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { ToastService } from '../../shared/ui/toast';

type Tab = 'items' | 'payment' | 'history';

const CANCEL_REASONS = ['Hết hàng thực tế', 'Nghi gian lận', 'Khách yêu cầu qua CSKH', 'Sai thông tin giao hàng'];

/** Popup chi tiết đơn (OA-03) với xác nhận (OA-04), hủy có lý do (OA-06) và in phiếu. */
@Component({
  selector: 'app-order-popup',
  imports: [DetailPopupComponent, ConfirmDialogComponent, ...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-popup.component.html',
  styleUrl: './order-popup.component.css',
})
export class OrderPopupComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly orderId = input.required<string>();
  readonly orderCode = input('');
  readonly closed = output<void>();
  readonly changed = output<void>();

  protected readonly tab = signal<Tab>('items');
  protected readonly busy = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelError = signal('');
  protected readonly cancelReasons = CANCEL_REASONS;
  protected readonly orderStatus = ORDER_STATUS;
  protected readonly paymentStatus = PAYMENT_STATUS;
  protected readonly paymentMethod = PAYMENT_METHOD;
  protected readonly deliveredBy = DELIVERED_BY;
  protected readonly toneClass = toneClass;

  protected readonly detail = rxResource({
    request: () => this.orderId(),
    loader: ({ request }) => this.api.order(request),
  });

  protected readonly title = computed(() => `#${this.detail.value()?.orderCode ?? this.orderCode()}`);
  protected readonly canConfirm = computed(() => this.detail.value()?.status === 'PENDING_CONFIRMATION');
  protected readonly canCancel = computed(() => this.detail.value()?.allowedNext.includes('CANCELLED') ?? false);

  /** Dòng tóm tắt giao hàng/thanh toán: "Giao bởi: Đội xe · Cọc 30% QR". */
  protected summaryLine(order: OrderDetail): string {
    const payment =
      order.payment.collectionType === 'DEPOSIT'
        ? `Cọc ${formatVnd(order.payment.depositAmount)}`
        : (PAYMENT_METHOD[order.payment.method] ?? order.payment.method);
    return `Giao bởi: ${DELIVERED_BY[order.deliveredBy]} · ${payment}`;
  }

  protected confirm(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.confirmOrder(this.orderId()).subscribe({
      next: (order) => {
        this.busy.set(false);
        this.detail.set(order);
        this.toast.show(`Đã xác nhận đơn #${order.orderCode}.`);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.show(apiMessage(error), 'error');
        this.detail.reload();
      },
    });
  }

  protected cancel(reason: string): void {
    this.busy.set(true);
    this.cancelError.set('');
    this.api.cancelOrder(this.orderId(), reason).subscribe({
      next: (order) => {
        this.busy.set(false);
        this.cancelling.set(false);
        this.detail.set(order);
        this.toast.show(`Đã hủy đơn #${order.orderCode}. Hàng đã được trả về kho.`);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.cancelError.set(apiMessage(error));
      },
    });
  }

  protected print(order: OrderDetail): void {
    printDocument(`Phiếu đơn hàng #${order.orderCode}`, [
      {
        lines: [
          `Ngày đặt: ${formatDate(order.createdAt)} ${formatTime(order.createdAt)}`,
          `Trạng thái: ${ORDER_STATUS[order.status]?.label ?? order.status}`,
          `Khách hàng: ${order.customerName} · ${order.customerPhone}`,
          `Địa chỉ: ${order.address}`,
          this.summaryLine(order),
          ...(order.note ? [`Ghi chú: ${order.note}`] : []),
        ],
      },
      {
        heading: 'Sản phẩm',
        table: {
          head: ['Sản phẩm', 'SKU', 'SL', 'Thành tiền'],
          rows: order.items.map((item) => [item.name, item.sku, item.quantity, formatVnd(item.finalAmount)]),
          numeric: [2, 3],
        },
      },
      {
        lines: [
          `Phí vận chuyển: ${formatVnd(order.amounts.shippingFee)}`,
          `Phí lắp đặt: ${formatVnd(order.amounts.installationFee)}`,
          `Tổng cộng: ${formatVnd(order.amounts.total)}`,
        ],
      },
    ]);
  }
}
