import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FlashSale } from 'shared';
import { CountdownComponent } from '../../../../shared/ui/countdown/countdown.component';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { ProductCardComponent } from '../../../../shared/ui/product-card/product-card.component';
import { ScrollCarouselComponent } from '../../../../shared/ui/scroll-carousel/scroll-carousel.component';

@Component({
  selector: 'app-flash-sale',
  imports: [
    RouterLink,
    CountdownComponent,
    IconComponent,
    ProductCardComponent,
    ScrollCarouselComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flash-sale.component.html',
  styleUrl: './flash-sale.component.css',
})
export class FlashSaleComponent {
  readonly flashSale = input.required<FlashSale>();
}
