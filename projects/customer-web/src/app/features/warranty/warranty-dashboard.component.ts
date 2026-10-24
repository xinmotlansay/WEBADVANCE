import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { WarrantyService } from 'shared';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { STATUS_LABELS } from '../../shared/ui/request-timeline/request-timeline.component';
@Component({
  selector: 'app-warranty-dashboard',
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warranty-dashboard.component.html',
  styleUrl: './warranty-dashboard.component.css',
})
export class WarrantyDashboardComponent {
  private readonly api = inject(WarrantyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly labels = STATUS_LABELS;
  protected readonly retry = new Subject<number>();
  protected readonly lookup = new FormControl('', { nonNullable: true });
  protected readonly cards = toSignal(
    combineLatest([
      this.lookup.valueChanges.pipe(startWith(''), debounceTime(300), distinctUntilChanged()),
      this.retry.pipe(startWith(0)),
    ]).pipe(
      switchMap(([q]) =>
        this.api.cards(q).pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
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
