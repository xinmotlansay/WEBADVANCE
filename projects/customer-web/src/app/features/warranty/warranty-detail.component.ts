import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, startWith, Subject, switchMap } from 'rxjs';
import { WarrantyService } from 'shared';
import {
  RequestTimelineComponent,
  STATUS_LABELS,
} from '../../shared/ui/request-timeline/request-timeline.component';
@Component({
  selector: 'app-warranty-detail',
  imports: [RouterLink, RequestTimelineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warranty-detail.component.html',
  styleUrl: './warranty-detail.component.css',
})
export class WarrantyDetailComponent {
  private readonly api = inject(WarrantyService);
  protected readonly retry = new Subject<number>();
  protected readonly labels = STATUS_LABELS;
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
}
