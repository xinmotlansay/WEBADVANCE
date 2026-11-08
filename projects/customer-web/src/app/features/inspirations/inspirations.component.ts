import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogApiService, type InspirationSummary } from 'shared';
import { catchError, map, of } from 'rxjs';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { InspirationGridComponent } from '../../shared/ui/inspiration-grid/inspiration-grid.component';

/** `null` khi tải lỗi, `undefined` khi đang tải. */
type InspirationState = InspirationSummary[] | null | undefined;

@Component({
  selector: 'app-inspirations',
  imports: [RouterLink, IconComponent, InspirationGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspirations.component.html',
  styleUrl: './inspirations.component.css',
})
export class InspirationsComponent {
  protected readonly items = toSignal(
    inject(CatalogApiService)
      .getInspirations()
      .pipe(
        map((items): InspirationState => items),
        catchError(() => of<InspirationState>(null)),
      ),
    { initialValue: undefined as InspirationState },
  );
}
