import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CollectionImage, CollectionSummary } from 'shared';
import { HotspotImageComponent } from '../../../../shared/ui/hotspot-image/hotspot-image.component';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-collection-slider',
  imports: [RouterLink, IconComponent, HotspotImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-slider.component.html',
  styleUrl: './collection-slider.component.css',
})
export class CollectionSliderComponent {
  readonly collections = input.required<CollectionSummary[]>();

  protected readonly index = signal(0);
  /** Thẻ hotspot đang mở, dùng chung cho các slide. */
  protected readonly activeHotspot = signal<string | null>(null);
  /** Khung ảnh theo CSS: 16/7 trên desktop, 4/3 trên điện thoại. */
  protected readonly ratio = signal('16 / 7');
  protected readonly current = computed(() => this.collections()[this.index()]);

  constructor() {
    const mobile = window.matchMedia('(max-width: 640px)');
    const sync = (): void => this.ratio.set(mobile.matches ? '4 / 3' : '16 / 7');
    sync();
    mobile.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => mobile.removeEventListener('change', sync));
  }

  protected slideImage(item: CollectionSummary): CollectionImage | null {
    return (
      item.thumbnailImage ?? { id: item.id, url: item.thumbnail, title: item.name, description: '', hotspots: [] }
    );
  }

  protected go(step: -1 | 1): void {
    const total = this.collections().length;
    if (total === 0) return;
    this.activeHotspot.set(null);
    this.index.update((i) => (i + step + total) % total);
  }
}
