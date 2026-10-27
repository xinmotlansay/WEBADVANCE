import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  type ElementRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogApiService, OrderApiService, type OrderPayment, type PublicConfig } from 'shared';
import { catchError, firstValueFrom, interval, of, switchMap, takeWhile, timer } from 'rxjs';
import { CartStore } from '../../../core/cart/cart.store';
import { toApiError } from '../../../core/http/api-error';
import { ToastService } from '../../../core/toast/toast.service';
import { CompactHeaderComponent } from '../../../layout/compact-header/compact-header.component';
import { VndPipe } from '../../../shared/pipes/vnd.pipe';

/** Polling thay Socket.IO (đã chốt trong spec). */
const POLL_MS = 5000;
/** Dưới 2 phút thì đồng hồ đổi màu cảnh báo. */
const WARN_SECONDS = 120;

const CANCEL_REASONS = [
  ['CHANGED_MIND', 'Đổi ý, không muốn mua nữa'],
  ['WRONG_ORDER', 'Đặt nhầm sản phẩm hoặc số lượng'],
  ['PAYMENT_TROUBLE', 'Gặp khó khăn khi chuyển khoản'],
  ['OTHER', 'Lý do khác'],
] as const;

/** Trang thanh toán QR (FR-38; spec mục 4.5). */
@Component({
  selector: 'app-payment',
  imports: [CompactHeaderComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
})
export class PaymentComponent {
  private readonly api = inject(OrderApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cart = inject(CartStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderId = inject(ActivatedRoute).snapshot.paramMap.get('orderId') ?? '';

  protected readonly config = toSignal(
    inject(CatalogApiService)
      .getPublicConfig()
      .pipe(catchError(() => of<PublicConfig | null>(null))),
    { initialValue: null },
  );

  protected readonly order = signal<OrderPayment | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly seconds = signal(0);
  protected readonly cancelling = signal(false);
  protected readonly reasons = CANCEL_REASONS;
  protected readonly reason = signal<string>(CANCEL_REASONS[0][0]);

  private readonly cancelDialog = viewChild<ElementRef<HTMLDialogElement>>('cancelDialog');

  protected readonly clock = computed(() => {
    const s = this.seconds();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly warning = computed(() => this.seconds() < WARN_SECONDS);
  /** Đơn đã kết thúc chờ thanh toán (hết hạn hoặc bị hủy). */
  protected readonly closed = computed(() => this.order()?.status === 'CANCELLED');

  constructor() {
    timer(0, POLL_MS)
      .pipe(
        switchMap(() =>
          this.api.getPayment(this.orderId).pipe(
            catchError((err: unknown) => {
              if (!this.order()) this.loadError.set(toApiError(err).message);
              return of(null);
            }),
          ),
        ),
        takeWhile(() => !this.closed(), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((order) => {
        if (order) this.apply(order);
      });

    // Đếm ngược phía client, đồng bộ lại theo server mỗi lần polling.
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.seconds.update((s) => Math.max(0, s - 1)));
  }

  private apply(order: OrderPayment): void {
    const wasWaiting = this.order()?.status === 'PENDING_PAYMENT';
    this.order.set(order);
    this.seconds.set(order.payment.secondsRemaining);
    // COD, đã trả tiền hoặc đã qua bước chờ thanh toán: sang trang thành công.
    if (order.paid || (order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED')) {
      // Chỉ báo khi tiền về lúc khách đang ở trang, không báo khi mở lại đơn đã trả trước đó.
      if (wasWaiting) this.toast.success('Đã nhận thanh toán');
      void this.router.navigate(['/checkout/success', order.id], { replaceUrl: true });
      return;
    }
    // Đơn từ giỏ bị hủy khi chờ thanh toán: các dòng đã được trả lại giỏ, tải lại badge.
    if (order.status === 'CANCELLED' && order.source === 'CART') this.cart.load();
  }

  protected async copy(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(`Đã sao chép ${label}`);
    } catch {
      this.toast.error('Trình duyệt không cho sao chép, vui lòng chép thủ công.');
    }
  }

  protected openCancel(): void {
    this.cancelDialog()?.nativeElement.showModal();
  }

  protected closeCancel(): void {
    this.cancelDialog()?.nativeElement.close();
  }

  protected async confirmCancel(): Promise<void> {
    this.cancelling.set(true);
    try {
      const reason = CANCEL_REASONS.find((r) => r[0] === this.reason())!;
      const order = await firstValueFrom(
        this.api.cancel(this.orderId, { reason: reason[0], reasonNote: reason[1] }),
      );
      this.closeCancel();
      this.apply(order);
    } catch (err) {
      this.closeCancel();
      this.toast.error(toApiError(err).message);
    } finally {
      this.cancelling.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate([this.order()?.source === 'CART' ? '/cart' : '/'], {
      replaceUrl: true,
    });
  }
}
