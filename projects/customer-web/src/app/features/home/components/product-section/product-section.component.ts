import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProductListItem } from 'shared';
import { ProductCardComponent } from '../../../../shared/ui/product-card/product-card.component';
import { ScrollCarouselComponent } from '../../../../shared/ui/scroll-carousel/scroll-carousel.component';

@Component({
  selector: 'app-product-section',
  imports: [RouterLink, ProductCardComponent, ScrollCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-section.component.html',
  styleUrl: './product-section.component.css',
})
export class ProductSectionComponent {
  readonly title = input.required<string>();
  readonly products = input.required<ProductListItem[]>();
  readonly layout = input<'carousel' | 'grid'>('grid');
  readonly moreLink = input<string>();
  readonly moreQueryParams = input<Record<string, string>>();
}
