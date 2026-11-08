import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogApiService, type FlashSale } from 'shared';
import { catchError, of } from 'rxjs';
import { CountdownComponent } from '../../shared/ui/countdown/countdown.component';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import { ProductListComponent } from '../products/product-list.component';

@Component({
  selector: 'app-promotions',
  imports: [RouterLink, CountdownComponent, IconComponent, ProductListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promotions.component.html',
  styleUrl: './promotions.component.css',
})
export class PromotionsComponent {
  private readonly api = inject(CatalogApiService);

  protected readonly flashSale = toSignal(
    this.api.getFlashSale().pipe(catchError(() => of<FlashSale | null>(null))),
    { initialValue: null },
  );
}
