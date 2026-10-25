import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, startWith } from 'rxjs';
import { CatalogApiService } from 'shared';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
@Component({
  selector: 'app-product-detail',
  imports: [VndPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css',
})
export class ProductDetailComponent {
  private readonly api = inject(CatalogApiService);
  protected readonly product = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((p) =>
        this.api.getProduct(p.get('slug') ?? '').pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
}
