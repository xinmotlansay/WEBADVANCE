import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProductListItem } from 'shared';
import { VariantPickerService } from '../../../core/cart/variant-picker.service';
import { VndPipe } from '../../pipes/vnd.pipe';
import { IconComponent } from '../icons/icon.component';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, IconComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
  host: { '[class.product-card--compact]': 'compact()' },
})
export class ProductCardComponent {
  readonly product = input.required<ProductListItem>();
  /** Dạng gọn dùng trong khối Flash Sale: nền trắng, có nhãn phần trăm giảm. */
  readonly compact = input(false);

  protected readonly discountPercent = computed(() => {
    const { priceFrom, originalPriceFrom, hasPromotion } = this.product();
    if (!hasPromotion || originalPriceFrom <= priceFrom) return 0;
    return Math.round((1 - priceFrom / originalPriceFrom) * 100);
  });

  protected readonly link = computed(() => ['/products', this.product().slug]);

  /** Mọi biến thể đều hết hàng: khóa nút (BR-C03). */
  protected readonly soldOut = computed(() => this.product().stockStatus === 'OUT_OF_STOCK');

  private readonly picker = inject(VariantPickerService);

  protected openPicker(mode: 'add' | 'buy'): void {
    this.picker.open({ mode, slug: this.product().slug });
  }
}
