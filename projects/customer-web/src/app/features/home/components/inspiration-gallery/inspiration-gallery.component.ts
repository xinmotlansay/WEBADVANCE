import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { InspirationSummary } from 'shared';
import { InspirationGridComponent } from '../../../../shared/ui/inspiration-grid/inspiration-grid.component';

/** Trang chủ chỉ giới thiệu vài ảnh đầu, xem đủ ở trang Nguồn cảm hứng. */
const HOME_LIMIT = 3;

@Component({
  selector: 'app-inspiration-gallery',
  imports: [RouterLink, InspirationGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspiration-gallery.component.html',
  styleUrl: './inspiration-gallery.component.css',
})
export class InspirationGalleryComponent {
  readonly items = input.required<InspirationSummary[]>();

  protected readonly visible = computed(() => this.items().slice(0, HOME_LIMIT));
}
