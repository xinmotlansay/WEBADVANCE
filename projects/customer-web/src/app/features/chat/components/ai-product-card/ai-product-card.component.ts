import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChatAiProductSuggestion } from 'shared';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

/** Thẻ sản phẩm AI gợi ý. Các nút giỏ/tim chỉ để đúng thiết kế, chưa có chức năng. */
@Component({
  selector: 'app-ai-product-card',
  imports: [VndPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-product-card.component.html',
  styleUrl: './ai-product-card.component.css',
})
export class AiProductCardComponent {
  readonly product = input.required<ChatAiProductSuggestion>();

  protected readonly discountPercent = computed(() => {
    const product = this.product();
    if (!product.hasPromotion || !product.originalPrice || product.originalPrice <= product.price) {
      return 0;
    }
    return Math.round((1 - product.price / product.originalPrice) * 100);
  });
}
