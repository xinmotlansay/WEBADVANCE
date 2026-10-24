import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CollectionImage } from 'shared';
import { VndPipe } from '../../pipes/vnd.pipe';
@Component({
  selector: 'app-hotspot-image',
  imports: [RouterLink, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hotspot-image.component.html',
  styleUrl: './hotspot-image.component.css',
})
export class HotspotImageComponent {
  readonly image = input.required<CollectionImage>();
  readonly active = model<string | null>(null);
}
