import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CatalogApiService } from 'shared';
@Component({
  selector: 'app-policy',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './policy.component.html',
})
export class PolicyComponent {
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as string;
  protected readonly config = toSignal(
    inject(CatalogApiService)
      .getPublicConfig()
      .pipe(catchError(() => of(null))),
  );
}
