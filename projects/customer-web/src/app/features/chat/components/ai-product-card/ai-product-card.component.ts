import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChatAiProductSuggestion } from 'shared';
import { CollectionWishlistService } from '../../../../services/cart/collection-wishlist.service';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

/** Thẻ sản phẩm AI gợi ý. Nút tim thêm/bỏ khỏi danh sách yêu thích, nút giỏ chưa có chức năng. */
@Component({
  selector: 'app-ai-product-card',
  imports: [VndPipe, IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-product-card.component.html',
  styleUrl: './ai-product-card.component.css',
})
export class AiProductCardComponent {
  readonly product = input.required<ChatAiProductSuggestion>();
  /** Khách bấm sang trang sản phẩm; khung chat nên thu nhỏ lại. */
  readonly opened = output<void>();

  private readonly wishlist = inject(CollectionWishlistService);

  protected readonly wished = computed(() => this.wishlist.ids().includes(this.product().id));

  protected toggleWish(): void {
    this.wishlist.toggle(this.product().id);
  }

  protected readonly discountPercent = computed(() => {
    const product = this.product();
    if (!product.hasPromotion || !product.originalPrice || product.originalPrice <= product.price) {
      return 0;
    }
    return Math.round((1 - product.price / product.originalPrice) * 100);
  });
}
