import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReturnExchangeService } from 'shared';
import { catchError, combineLatest, of, startWith, Subject, switchMap } from 'rxjs';
import { STATUS_LABELS } from '../../shared/ui/request-timeline/request-timeline.component';
@Component({
  selector: 'app-return-dashboard',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-dashboard.component.html',
  styleUrl: './return-dashboard.component.css',
})
export class ReturnDashboardComponent {
  private readonly api = inject(ReturnExchangeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly labels = STATUS_LABELS;
  protected readonly retry = new Subject<number>();
  protected readonly list = toSignal(
    combineLatest([this.route.queryParamMap, this.retry.pipe(startWith(0))]).pipe(
      switchMap(([p]) =>
        this.api.list(Math.max(1, Number(p.get('page')) || 1)).pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
  protected page(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page } });
  }
}
