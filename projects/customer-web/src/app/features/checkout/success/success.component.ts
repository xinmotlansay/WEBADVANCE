import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OrderApiService, type OrderDetail } from 'shared';
import { toApiError } from '../../../core/http/api-error';
import { CompactHeaderComponent } from '../../../layout/compact-header/compact-header.component';
import { VndPipe } from '../../../shared/pipes/vnd.pipe';
import { IconComponent } from '../../../shared/ui/icons/icon.component';
import { formatDay } from '../checkout-rules';

const SLOT_LABEL = { MORNING: 'Sáng 8:00–12:00', AFTERNOON: 'Chiều 13:00–17:00' } as const;

/** Đặt hàng / thanh toán thành công (spec mục 4.6). */
@Component({
  selector: 'app-checkout-success',
  imports: [RouterLink, CompactHeaderComponent, IconComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './success.component.html',
  styleUrl: './success.component.css',
})
export class SuccessComponent {
  private readonly router = inject(Router);

  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly paidNow = computed(() => {
    const o = this.order();
    if (!o || (o.payment.status !== 'PAID' && o.payment.status !== 'DEPOSITED')) return null;
    return o.payment.collectionType === 'DEPOSIT' ? o.payment.depositAmount : o.totalAmount;
  });
  protected readonly delivery = computed(() => {
    const s = this.order()?.shipment;
    if (!s) return null;
    if (s.scheduledDate && s.scheduledSlot) {
      return `Hẹn giao ${formatDay(s.scheduledDate)}, ${SLOT_LABEL[s.scheduledSlot]}`;
    }
    return s.estimatedDeliveryDate ? `Giao dự kiến ${formatDay(s.estimatedDeliveryDate)}` : null;
  });
  protected readonly addressText = computed(() => {
    const a = this.order()?.shippingAddress;
    return a ? [a.addressLine, a.ward, a.district, a.province].filter(Boolean).join(', ') : '';
  });

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';
    inject(OrderApiService)
      .get(id)
      .subscribe({
        next: (order) => {
          // Đơn QR chưa trả tiền: quay lại trang QR.
          if (order.status === 'PENDING_PAYMENT') {
            void this.router.navigate(['/checkout/payment', id], { replaceUrl: true });
            return;
          }
          this.order.set(order);
        },
        error: (err: unknown) => this.error.set(toApiError(err).message),
      });
  }
}
