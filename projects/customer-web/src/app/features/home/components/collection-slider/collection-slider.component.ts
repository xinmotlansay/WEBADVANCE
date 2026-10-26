import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CollectionSummary } from 'shared';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-collection-slider',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-slider.component.html',
  styleUrl: './collection-slider.component.css',
})
export class CollectionSliderComponent {
  readonly collections = input.required<CollectionSummary[]>();

  protected readonly index = signal(0);
  protected readonly current = computed(() => this.collections()[this.index()]);

  protected go(step: -1 | 1): void {
    const total = this.collections().length;
    if (total === 0) return;
    this.index.update((i) => (i + step + total) % total);
  }
}
