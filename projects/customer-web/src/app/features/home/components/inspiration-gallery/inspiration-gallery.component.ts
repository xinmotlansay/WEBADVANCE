import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { InspirationSummary } from 'shared';
import { InspirationModalComponent } from '../inspiration-modal/inspiration-modal.component';

@Component({
  selector: 'app-inspiration-gallery',
  imports: [RouterLink, InspirationModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspiration-gallery.component.html',
  styleUrl: './inspiration-gallery.component.css',
})
export class InspirationGalleryComponent {
  readonly items = input.required<InspirationSummary[]>();

  /** Vị trí ảnh đang mở trong popup Shop by look, `null` khi đóng. */
  protected readonly openIndex = signal<number | null>(null);
}
