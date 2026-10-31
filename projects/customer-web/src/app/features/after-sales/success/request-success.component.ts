import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ReturnExchangeService, WarrantyService } from 'shared';
import { CompactHeaderComponent } from '../../../layout/compact-header/compact-header.component';
import { IconComponent } from '../../../shared/ui/icons/icon.component';

/** Gửi yêu cầu bảo hành / đổi trả thành công, kèm lối sang trang theo dõi. */
@Component({
  selector: 'app-request-success',
  imports: [RouterLink, DatePipe, CompactHeaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-success.component.html',
  styleUrl: './request-success.component.css',
})
export class RequestSuccessComponent {
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly isReturn = this.query.get('kind') === 'return';
  protected readonly id = this.query.get('request') ?? '';
  protected readonly request = toSignal(
    (this.isReturn ? inject(ReturnExchangeService) : inject(WarrantyService))
      .detail(this.id)
      .pipe(catchError(() => of(null))),
  );
}
