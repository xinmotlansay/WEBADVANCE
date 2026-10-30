import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { CatalogApiService, type PublicConfig } from 'shared';
import { catchError, of } from 'rxjs';
import { CartStore } from '../../core/cart/cart.store';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { toApiError } from '../../core/http/api-error';
import { ToastService } from '../../core/toast/toast.service';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
import { CartLineComponent } from './cart-line/cart-line.component';
import { isBlocking } from './cart-rules';

/** Trang giỏ hàng (FR-29; spec giỏ hàng mục 4.3). */
@Component({
  selector: 'app-cart',
  imports: [RouterLink, CartLineComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css',
})
export class CartComponent {
  protected readonly store = inject(CartStore);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  private readonly config = toSignal(
    inject(CatalogApiService)
      .getPublicConfig()
      .pipe(catchError(() => of<PublicConfig | null>(null))),
    { initialValue: null },
  );

  protected readonly busy = signal(false);

  protected readonly items = computed(() => this.store.cart()?.items ?? []);
  protected readonly summary = computed(() => this.store.cart()?.summary ?? null);
  protected readonly selected = computed(() => this.items().filter((i) => i.isSelected));
  private readonly selectable = computed(() => this.items().filter((i) => !isBlocking(i.warnings)));
  protected readonly allSelected = computed(
    () => this.selectable().length > 0 && this.selectable().every((i) => i.isSelected),
  );

  /** FR-39: báo trước khi tổng vượt ngưỡng cọc. */
  protected readonly depositNote = computed(() => {
    const payment = this.config()?.payment;
    const total = this.summary()?.totalAmount ?? 0;
    return payment && total > payment.depositThreshold
      ? `Đơn trên ${payment.depositThreshold.toLocaleString('vi-VN')} VND cần đặt cọc ${Math.round(payment.depositRate * 100)}% khi thanh toán.`
      : null;
  });

  constructor() {
    // Mỗi lần vào trang tải lại để thấy giá và tồn kho mới nhất.
    this.store.load();
  }

  protected async toggleAll(box: HTMLInputElement): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.setSelection(box.checked);
    } catch (err) {
      box.checked = this.allSelected();
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeSelected(): Promise<void> {
    const ids = this.selected().map((i) => i.id);
    if (!ids.length) return;
    const ok = await this.confirm.ask({
      title: 'Xóa sản phẩm đã chọn?',
      message: `${ids.length} sản phẩm sẽ bị xóa khỏi giỏ hàng.`,
      confirmText: 'Xóa',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      // ponytail: xóa từng dòng vì API chưa có xóa hàng loạt; thêm endpoint nếu giỏ thường rất dài.
      for (const id of ids) await this.store.remove(id);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected checkout(): void {
    void this.router.navigate(['/checkout'], { queryParams: { source: 'cart' } });
  }
}
