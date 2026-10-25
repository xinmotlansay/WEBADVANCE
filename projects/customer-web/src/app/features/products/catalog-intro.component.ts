import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Category } from 'shared';

@Component({
  selector: 'app-catalog-intro',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-intro.component.html',
  styleUrl: './catalog-intro.component.css',
})
export class CatalogIntroComponent {
  readonly keyword = input('');
  readonly imageSearch = input(false);
  readonly rooms = input<Category[]>([]);
  readonly roomSelected = output<string>();
}
