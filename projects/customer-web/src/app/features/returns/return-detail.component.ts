import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, startWith, Subject, switchMap } from 'rxjs';
import { ReturnExchangeService } from 'shared';
import { apiErrorMessage } from '../../core/api-error';
import {
  RequestTimelineComponent,
  STATUS_LABELS,
} from '../../shared/ui/request-timeline/request-timeline.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
@Component({
  selector: 'app-return-detail',
  imports: [RouterLink, RequestTimelineComponent, VndPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './return-detail.component.html',
  styleUrl: './return-detail.component.css',
})
export class ReturnDetailComponent {
  private readonly api = inject(ReturnExchangeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly retry = new Subject<number>();
  protected readonly labels = STATUS_LABELS;
  protected readonly confirming = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly detail = toSignal(
    combineLatest([inject(ActivatedRoute).paramMap, this.retry.pipe(startWith(0))]).pipe(
      switchMap(([p]) =>
        this.api.detail(p.get('id') ?? '').pipe(
          catchError(() => of(null)),
          startWith(undefined),
        ),
      ),
    ),
  );
  protected isVideo(url: string): boolean {
    return /\.(mp4|mov)$/i.test(url);
  }
  protected cancel(id: string): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .cancel(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.confirming.set(false);
          this.retry.next(0);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }
}
