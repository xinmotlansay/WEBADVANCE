import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Category } from 'shared';
import { IconComponent } from '../../shared/ui/icons/icon.component';

@Component({
  selector: 'app-catalog-intro',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-intro.component.html',
  styleUrl: './catalog-intro.component.css',
})
export class CatalogIntroComponent {
  readonly keyword = input('');
  readonly rooms = input<Category[]>([]);
  readonly searchRequested = output<string>();
  readonly roomSelected = output<string>();
}
