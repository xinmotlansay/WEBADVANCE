import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PublicConfig } from 'shared';
type SupportView = 'overview' | 'warranty' | 'return' | 'requests';
@Component({
  selector: 'app-support-intro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-intro.component.html',
  styleUrl: './support-intro.component.css',
})
export class SupportIntroComponent {
  readonly config = input<PublicConfig | null>();
  readonly view = input<SupportView>('overview');
  readonly totalRequests = input<number | null>(null);
  readonly viewSelected = output<SupportView>();
}
