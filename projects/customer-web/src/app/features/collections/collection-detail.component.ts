import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, startWith, Subject, combineLatest } from 'rxjs';
import { CatalogApiService } from 'shared';
import { HotspotImageComponent } from '../../shared/ui/hotspot-image/hotspot-image.component';
import { ProductCardComponent } from '../../shared/ui/product-card/product-card.component';
@Component({
  selector: 'app-collection-detail',
  imports: [HotspotImageComponent, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-detail.component.html',
  styleUrl: './collection-detail.component.css',
})
export class CollectionDetailComponent {
  private readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly retry = new Subject<number>();
  protected readonly detail = toSignal(
    combineLatest([this.route.paramMap, this.retry.pipe(startWith(0))]).pipe(
      switchMap(([p]) =>
        this.api.getCollection(p.get('slug') ?? '').pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
}
