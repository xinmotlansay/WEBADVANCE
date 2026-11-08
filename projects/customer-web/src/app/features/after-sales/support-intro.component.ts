import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PublicConfig } from 'shared';
@Component({
  selector: 'app-support-intro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-intro.component.html',
  styleUrl: './support-intro.component.css',
})
export class SupportIntroComponent {
  readonly config = input<PublicConfig | null>();
  /** Khung yêu cầu đang xổ xuống dưới hai thẻ dịch vụ. */
  readonly activePanel = input<'warranty' | 'return' | null>(null);
  readonly viewSelected = output<'warranty' | 'return'>();
}
