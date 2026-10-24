import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogApiService } from 'shared';
import { catchError, of, startWith, Subject, switchMap } from 'rxjs';
import { InspirationGalleryComponent } from '../home/components/inspiration-gallery/inspiration-gallery.component';
@Component({
  selector: 'app-inspirations',
  imports: [InspirationGalleryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspirations.component.html',
})
export class InspirationsComponent {
  private readonly api = inject(CatalogApiService);
  protected readonly retry = new Subject<number>();
  protected readonly items = toSignal(
    this.retry.pipe(
      startWith(0),
      switchMap(() =>
        this.api.getInspirations().pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
}
