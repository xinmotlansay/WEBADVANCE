import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CatalogApiService, ReturnExchangeService, WarrantyService } from 'shared';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../../../core/api-error';
import { VndPipe } from '../../../../shared/pipes/vnd.pipe';
import {
  RequestTimelineComponent,
  STATUS_LABELS,
} from '../../../../shared/ui/request-timeline/request-timeline.component';

type Tab = 'warranty' | 'returns';

/** Theo dõi yêu cầu bảo hành và đổi trả của khách; gửi yêu cầu mới ở trang /support. */
@Component({
  selector: 'app-account-after-sales',
  imports: [RouterLink, DatePipe, VndPipe, RequestTimelineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './after-sales.component.html',
  styleUrl: './after-sales.component.css',
})
export class AfterSalesComponent {
  private readonly warrantyApi = inject(WarrantyService);
  private readonly returnsApi = inject(ReturnExchangeService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly labels = STATUS_LABELS;
  /** Địa chỉ cửa hàng (phía nhận/gửi hàng còn lại của yêu cầu). */
  protected readonly store = toSignal(
    this.catalogApi.getPublicConfig().pipe(
      map((config) => config.store),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
  protected readonly tab = signal<Tab>(this.query.get('kind') === 'return' ? 'returns' : 'warranty');
  protected readonly warrantyPage = signal(1);
  protected readonly returnsPage = signal(1);
  protected readonly retry = new Subject<number>();
  /** Yêu cầu đang xem chi tiết (mở thẳng từ link sau khi gửi yêu cầu). */
  protected readonly selectedId = signal(this.query.get('request') ?? '');
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly actionError = signal('');

  protected readonly warranty = toSignal(
    combineLatest([toObservable(this.warrantyPage), this.retry.pipe(startWith(0))]).pipe(
      switchMap(([page]) => this.warrantyApi.list(page).pipe(catchError(() => of(null)), startWith(undefined))),
    ),
  );
  protected readonly returns = toSignal(
    combineLatest([toObservable(this.returnsPage), this.retry.pipe(startWith(0))]).pipe(
      switchMap(([page]) => this.returnsApi.list(page).pipe(catchError(() => of(null)), startWith(undefined))),
    ),
  );
  protected readonly detail = toSignal(
    combineLatest([toObservable(this.selectedId), toObservable(this.tab), this.retry.pipe(startWith(0))]).pipe(
      switchMap(([id, tab]) =>
        id
          ? (tab === 'returns' ? this.returnsApi : this.warrantyApi)
              .detail(id)
              .pipe(catchError(() => of(null)), startWith(undefined))
          : of(null),
      ),
    ),
  );
  protected readonly isReturn = computed(() => this.tab() === 'returns');

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.closeDetail();
  }

  protected open(id: string): void {
    this.confirming.set(false);
    this.actionError.set('');
    this.selectedId.set(id);
  }

  protected closeDetail(): void {
    this.selectedId.set('');
    this.confirming.set(false);
    this.actionError.set('');
  }

  protected isVideo(url: string): boolean {
    return /\.(mp4|mov)$/i.test(url);
  }

  protected cancelRequest(id: string): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.actionError.set('');
    this.returnsApi
      .cancel(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.confirming.set(false);
          this.retry.next(0);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.actionError.set(apiErrorMessage(error));
        },
      });
  }
}
