import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { CatalogApiService, CollectionSummary } from 'shared';
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
  protected readonly sceneHeight = signal(0);
  protected readonly current = computed(() => this.collections()[this.index() % (this.collections().length || 1)]);
  private readonly api = inject(CatalogApiService);
  protected readonly detail = toSignal(toObservable(this.current).pipe(
    switchMap((collection) => collection ? this.api.getCollection(collection.slug).pipe(
      catchError(() => of(null)), startWith(null),
    ) : of(null)),
  ));
  protected readonly scene = computed(() => {
    const images = this.detail()?.images ?? [];
    return images.find((image) => image.isThumbnail) ?? images[0];
  });

  protected go(step: -1 | 1): void {
    const total = this.collections().length;
    if (total === 0) return;
    this.index.update((i) => (i + step + total) % total);
  }
}
