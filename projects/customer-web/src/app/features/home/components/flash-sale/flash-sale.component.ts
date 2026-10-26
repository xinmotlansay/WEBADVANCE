import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FlashSale } from 'shared';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { ProductCardComponent } from '../../../../shared/ui/product-card/product-card.component';
import { ScrollCarouselComponent } from '../../../../shared/ui/scroll-carousel/scroll-carousel.component';

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

@Component({
  selector: 'app-flash-sale',
  imports: [RouterLink, IconComponent, ProductCardComponent, ScrollCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flash-sale.component.html',
  styleUrl: './flash-sale.component.css',
})
export class FlashSaleComponent {
  readonly flashSale = input.required<FlashSale>();

  private readonly now = signal(Date.now());

  protected readonly countdown = computed(() => {
    const end = new Date(this.flashSale().promotion.endDate).getTime();
    const seconds = Math.max(0, Math.floor((end - this.now()) / SECOND_MS));
    const pad = (n: number): string => String(n).padStart(2, '0');
    return [
      { label: 'NGÀY', value: pad(Math.floor(seconds / DAY_S)) },
      { label: 'GIỜ', value: pad(Math.floor((seconds % DAY_S) / HOUR_S)) },
      { label: 'PHÚT', value: pad(Math.floor((seconds % HOUR_S) / MINUTE_S)) },
      { label: 'GIÂY', value: pad(seconds % MINUTE_S) },
    ];
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), SECOND_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
