import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdminApiService, apiMessage, type ProductDetail } from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { PRODUCT_STATUS, STOCK_STATE, toneClass } from '../../shared/status';
import { DetailPopupComponent } from '../../shared/ui/detail-popup.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { ToastService } from '../../shared/ui/toast';

type Tab = 'variants' | 'packages' | 'media';

const INSTALLATION: Record<string, string> = { OPTIONAL: 'Tùy chọn', REQUIRED: 'Bắt buộc' };

/** Popup chi tiết sản phẩm (PA-03): biến thể, kiện hàng, ảnh & 3D; ẩn/hiện, ngừng KD (PA-06), nhập kho (PA-08). */
@Component({
  selector: 'app-product-popup',
  imports: [RouterLink, DetailPopupComponent, ConfirmDialogComponent, ...FORMAT_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-popup.component.html',
  styleUrl: './product-popup.component.css',
})
export class ProductPopupComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly productId = input.required<string>();
  readonly productName = input('');
  readonly closed = output<void>();
  readonly changed = output<void>();
  readonly importStock = output<string>();

  protected readonly tab = signal<Tab>('variants');
  protected readonly busy = signal(false);
  protected readonly discontinuing = signal(false);
  protected readonly productStatus = PRODUCT_STATUS;
  protected readonly stockState = STOCK_STATE;
  protected readonly installation = INSTALLATION;
  protected readonly toneClass = toneClass;

  protected readonly detail = rxResource({
    request: () => this.productId(),
    loader: ({ request }) => this.api.product(request),
  });

  protected readonly title = computed(() => this.detail.value()?.name ?? this.productName());
  protected readonly category = computed(
    () => this.detail.value()?.categories.find((c) => c.type === 'PRODUCT_CATEGORY')?.name ?? 'Chưa phân loại',
  );
  protected readonly priceRange = computed(() => {
    const prices = (this.detail.value()?.variants ?? []).filter((v) => v.status === 'ACTIVE').map((v) => v.salePrice);
    return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  });
  protected readonly images = computed(() => (this.detail.value()?.media ?? []).filter((m) => m.type === 'IMAGE'));
  protected readonly models = computed(() => (this.detail.value()?.media ?? []).filter((m) => m.type !== 'IMAGE'));

  protected setStatus(product: ProductDetail, status: string, message: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.setProductStatus(product.id, status).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.discontinuing.set(false);
        this.detail.set(updated);
        this.toast.show(`${updated.name}: ${message}`);
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.discontinuing.set(false);
        this.toast.show(apiMessage(error), 'error');
      },
    });
  }
}
