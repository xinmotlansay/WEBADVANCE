import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import type { InspirationSummary } from 'shared';
import { InspirationModalComponent } from '../inspiration-modal/inspiration-modal.component';

/** Lưới ảnh cảm hứng tỉ lệ 2:3; bấm vào một ảnh mở popup Shop by look. */
@Component({
  selector: 'app-inspiration-grid',
  imports: [InspirationModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspiration-grid.component.html',
  styleUrl: './inspiration-grid.component.css',
})
export class InspirationGridComponent {
  readonly items = input.required<InspirationSummary[]>();

  /** Vị trí ảnh đang mở trong popup, `null` khi đóng. */
  protected readonly openIndex = signal<number | null>(null);
}
