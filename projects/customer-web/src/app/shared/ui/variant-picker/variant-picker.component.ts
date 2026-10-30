import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  CatalogApiService,
  type ProductDetail,
  type ProductVariant,
  type PublicConfig,
} from 'shared';
import { catchError, of, switchMap } from 'rxjs';
import { saveBuyNow } from '../../../core/cart/buy-now';
import { CartStore } from '../../../core/cart/cart.store';
import {
  VariantPickerService,
  type VariantPickerRequest,
} from '../../../core/cart/variant-picker.service';
import { toApiError } from '../../../core/http/api-error';
import { ToastService } from '../../../core/toast/toast.service';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';
import { QuantityStepperComponent } from '../quantity-stepper/quantity-stepper.component';

type AttrKey = 'color' | 'material' | 'size';

const ATTRS: { key: AttrKey; label: string }[] = [
  { key: 'color', label: 'Màu sắc' },
  { key: 'material', label: 'Chất liệu' },
  { key: 'size', label: 'Kích thước' },
];

const STOCK_LABEL = { IN_STOCK: 'Còn hàng', LOW_STOCK: 'Sắp hết hàng', OUT_OF_STOCK: 'Hết hàng' };

function attr(v: ProductVariant, key: AttrKey): string {
  if (key !== 'size') return v[key] ?? '';
  const d = v.dimensions;
  return d?.length && d.width && d.height ? `${d.length}×${d.width}×${d.height} ${d.unit}` : '';
}

/**
 * Popup chọn biến thể, số lượng, lắp đặt (FR-28, FR-32; spec giỏ hàng mục 4.2).
 * Biến thể hết hàng vẫn xem được nhưng khóa nút; số lượng vượt tồn do server chặn và báo lại.
 */
@Component({
  selector: 'app-variant-picker',
  imports: [IconComponent, QuantityStepperComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './variant-picker.component.html',
  styleUrl: './variant-picker.component.css',
  host: { '(document:keydown.escape)': 'close()' },
})
export class VariantPickerComponent {
  private readonly api = inject(CatalogApiService);
  private readonly cart = inject(CartStore);
  private readonly picker = inject(VariantPickerService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly request = input.required<VariantPickerRequest>();

  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');

  /** `undefined`: đang tải, `null`: lỗi. */
  protected readonly product = toSignal(
    toObservable(computed(() => this.request().slug)).pipe(
      switchMap((slug) =>
        this.api.getProduct(slug).pipe(catchError(() => of<ProductDetail | null>(null))),
      ),
    ),
    { initialValue: undefined },
  );
  private readonly config = toSignal(
    this.api.getPublicConfig().pipe(catchError(() => of<PublicConfig | null>(null))),
    { initialValue: null },
  );

  protected readonly variantId = signal<string | null>(null);
  protected readonly quantity = signal(1);
  private readonly wantsInstallation = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Số lượng tối đa còn thêm được, biết sau khi server báo vượt tồn. */
  protected readonly maxQuantity = signal<number | null>(null);

  protected readonly attrs = ATTRS;
  protected readonly stockLabel = STOCK_LABEL;

  protected readonly selected = computed(() => {
    const variants = this.product()?.variants ?? [];
    return variants.find((v) => v.id === this.variantId()) ?? null;
  });

  /** Nhóm thuộc tính có giá trị, mỗi nhóm là danh sách giá trị không trùng theo thứ tự biến thể. */
  protected readonly groups = computed(() => {
    const variants = this.product()?.variants ?? [];
    return ATTRS.map(({ key, label }) => ({
      key,
      label,
      values: [...new Set(variants.map((v) => attr(v, key)).filter(Boolean))],
    })).filter((g) => g.values.length > 0);
  });

  protected readonly hasInstallation = computed(() => {
    const service = this.selected()?.installation.service;
    return service === 'REQUIRED' || (service === 'OPTIONAL' && this.wantsInstallation());
  });

  protected readonly unitShippingFee = computed(() => {
    const tier = this.selected()?.shippingTier;
    return this.config()?.shipping.tiers.find((t) => t.tier === tier)?.fee ?? null;
  });

  protected readonly image = computed(() => {
    const product = this.product();
    const id = this.variantId();
    return (
      product?.media.find((m) => m.type === 'IMAGE' && m.variantId === id)?.url ??
      product?.thumbnail
    );
  });

  protected readonly outOfStock = computed(() => this.selected()?.stockStatus === 'OUT_OF_STOCK');

  constructor() {
    // Khóa cuộn trang phía sau khi popup đang mở.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => (document.body.style.overflow = previousOverflow));
    afterNextRender(() => this.closeButton().nativeElement.focus());

    // Tải xong sản phẩm thì chọn sẵn: dòng đang sửa, hoặc biến thể còn hàng đầu tiên.
    effect(() => {
      const product = this.product();
      if (!product) return;
      untracked(() => {
        const request = this.request();
        if (request.mode === 'update') {
          this.variantId.set(request.variantId);
          this.quantity.set(request.quantity);
          this.wantsInstallation.set(request.hasInstallation);
        } else {
          const first =
            product.variants.find((v) => v.stockStatus !== 'OUT_OF_STOCK') ?? product.variants[0];
          this.variantId.set(first?.id ?? null);
        }
      });
    });
  }

  protected valueOf(key: AttrKey): string {
    const v = this.selected();
    return v ? attr(v, key) : '';
  }

  /** Có biến thể mang giá trị này mà vẫn giữ nguyên các thuộc tính đang chọn khác không. */
  protected isCombinable(key: AttrKey, value: string): boolean {
    const current = this.selected();
    return (this.product()?.variants ?? []).some(
      (v) =>
        attr(v, key) === value &&
        ATTRS.every((a) => a.key === key || !current || attr(v, a.key) === attr(current, a.key)),
    );
  }

  /** Chọn giá trị: ưu tiên biến thể giữ được nhiều thuộc tính đang chọn nhất. */
  protected choose(key: AttrKey, value: string): void {
    const current = this.selected();
    const candidates = (this.product()?.variants ?? []).filter((v) => attr(v, key) === value);
    const score = (v: ProductVariant): number =>
      ATTRS.filter((a) => current && attr(v, a.key) === attr(current, a.key)).length;
    const best = candidates.reduce<ProductVariant | null>(
      (top, v) => (!top || score(v) > score(top) ? v : top),
      null,
    );
    if (best) this.selectVariant(best.id);
  }

  protected setQuantity(value: number): void {
    this.quantity.set(value);
    this.error.set(null);
  }

  protected toggleInstallation(checked: boolean): void {
    this.wantsInstallation.set(checked);
  }

  protected close(): void {
    this.picker.close();
  }

  protected async addToCart(): Promise<void> {
    const v = this.selected();
    if (!v) return;
    await this.run(async () => {
      await this.cart.add({
        variantId: v.id,
        quantity: this.quantity(),
        hasInstallation: this.hasInstallation(),
      });
      this.toast.success('Đã thêm vào giỏ hàng');
    });
  }

  protected buyNow(): void {
    const v = this.selected();
    if (!v) return;
    saveBuyNow([
      { variantId: v.id, quantity: this.quantity(), hasInstallation: this.hasInstallation() },
    ]);
    this.close();
    void this.router.navigate(['/checkout'], { queryParams: { source: 'buy-now' } });
  }

  protected async updateItem(): Promise<void> {
    const v = this.selected();
    const request = this.request();
    if (!v || request.mode !== 'update') return;
    await this.run(async () => {
      await this.cart.update(request.itemId, {
        variantId: v.id,
        quantity: this.quantity(),
        hasInstallation: this.hasInstallation(),
      });
      this.toast.success('Đã cập nhật giỏ hàng');
    });
  }

  private selectVariant(id: string): void {
    this.variantId.set(id);
    this.maxQuantity.set(null);
    this.error.set(null);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.close();
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'INSUFFICIENT_STOCK') {
        const { available = 0, inCart = 0 } = (e.details ?? {}) as {
          available?: number;
          inCart?: number;
        };
        // Sửa dòng giữ nguyên biến thể: `inCart` là chính dòng đó nên tối đa bằng tồn kho.
        // Thêm mới hoặc đổi sang biến thể đã có trong giỏ: phải trừ phần đã nằm trong giỏ.
        const request = this.request();
        const sameLine = request.mode === 'update' && request.variantId === this.variantId();
        const otherInCart = sameLine ? 0 : inCart;
        const room = available - otherInCart;
        this.maxQuantity.set(Math.max(1, room));
        if (room > 0) this.quantity.set(Math.min(this.quantity(), room));
        this.error.set(
          room > 0
            ? `${e.message}${otherInCart ? `, trong giỏ đã có ${otherInCart}` : ''}. Bạn chọn được tối đa ${room}.`
            : otherInCart
              ? `${e.message} và trong giỏ đã có đủ ${otherInCart} sản phẩm.`
              : e.message,
        );
      } else {
        this.error.set(e.message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
