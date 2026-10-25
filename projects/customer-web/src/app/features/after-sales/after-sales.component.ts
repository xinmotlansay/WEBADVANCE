import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  ElementRef,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, forkJoin, of, startWith, Subject, switchMap } from 'rxjs';
import { CatalogApiService, ReturnExchangeService, WarrantyService } from 'shared';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { IconComponent } from '../../shared/ui/icons/icon.component';
import {
  RequestTimelineComponent,
  STATUS_LABELS,
} from '../../shared/ui/request-timeline/request-timeline.component';
import { VndPipe } from '../../shared/pipes/vnd.pipe';
import { WarrantyFormComponent } from '../warranty/warranty-form.component';
import { ReturnFormComponent } from '../returns/return-form.component';
import { SupportOverviewComponent } from './support-overview.component';
import { SupportIntroComponent } from './support-intro.component';

type SupportView = 'overview' | 'warranty' | 'return' | 'requests';
type RequestKind = 'warranty' | 'return';
@Component({
  selector: 'app-after-sales',
  imports: [
    RouterLink,
    DatePipe,
    IconComponent,
    RequestTimelineComponent,
    VndPipe,
    WarrantyFormComponent,
    ReturnFormComponent,
    SupportOverviewComponent,
    SupportIntroComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './after-sales.component.html',
  styleUrl: './after-sales.component.css',
})
export class AfterSalesComponent {
  private readonly contentNav = viewChild<ElementRef<HTMLElement>>('contentNav');
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly warranty = inject(WarrantyService);
  private readonly returns = inject(ReturnExchangeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly refresh = new Subject<number>();
  protected readonly labels = STATUS_LABELS;
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly actionError = signal('');
  private readonly user$ = toObservable(this.auth.user);
  protected readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly view = computed<SupportView>(() => {
    const view = this.params().get('view');
    return view === 'warranty' || view === 'return' || view === 'requests' ? view : 'overview';
  });
  protected readonly kind = computed<RequestKind>(() =>
    this.params().get('kind') === 'return' ? 'return' : 'warranty',
  );
  protected readonly requestId = computed(() => this.params().get('request'));
  protected readonly config = toSignal(
    inject(CatalogApiService)
      .getPublicConfig()
      .pipe(catchError(() => of(null))),
  );
  protected readonly summary = toSignal(
    combineLatest([this.user$, this.refresh.pipe(startWith(0))]).pipe(
      switchMap(([user]) =>
        user
          ? forkJoin({
              warranty: this.warranty.list().pipe(catchError(() => of(null))),
              returns: this.returns.list().pipe(catchError(() => of(null))),
              cards: this.warranty.cards().pipe(catchError(() => of(null))),
            }).pipe(startWith(undefined))
          : of(null),
      ),
    ),
  );
  protected readonly totalRequests = computed(() => {
    const s = this.summary();
    return s?.warranty && s.returns ? s.warranty.meta.total + s.returns.meta.total : null;
  });
  protected readonly recentRequests = computed(() => {
    const s = this.summary();
    return [
      ...(s?.warranty?.data ?? []).map((r) => ({ ...r, kind: 'warranty' as const })),
      ...(s?.returns?.data ?? []).map((r) => ({ ...r, kind: 'return' as const })),
    ]
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
      .slice(0, 3);
  });
  protected readonly list = toSignal(
    combineLatest([this.user$, this.route.queryParamMap, this.refresh.pipe(startWith(0))]).pipe(
      switchMap(([user, p]) => {
        if (!user || p.get('view') !== 'requests' || p.has('request')) return of(null);
        const service = p.get('kind') === 'return' ? this.returns : this.warranty;
        return service
          .list(Math.max(1, Number(p.get('page')) || 1), p.get('status') || undefined)
          .pipe(
            catchError(() => of(null)),
            startWith(undefined),
          );
      }),
    ),
  );
  protected readonly detail = toSignal(
    combineLatest([this.user$, this.route.queryParamMap, this.refresh.pipe(startWith(0))]).pipe(
      switchMap(([user, p]) => {
        const id = p.get('request');
        if (!user || !id || p.get('view') !== 'requests') return of(null);
        return (p.get('kind') === 'return' ? this.returns : this.warranty).detail(id).pipe(
          catchError(() => of(null)),
          startWith(undefined),
        );
      }),
    ),
  );
  protected readonly statusOptions = computed(() =>
    this.kind() === 'return'
      ? [
          'PENDING',
          'CONFIRMED',
          'AWAITING_GOODS',
          'PROCESSING',
          'COMPLETED',
          'REJECTED',
          'CANCELLED',
        ]
      : ['PENDING_CONFIRMATION', 'RECEIVED', 'INSPECTING', 'IN_WARRANTY', 'COMPLETED', 'REJECTED'],
  );

  protected selectView(view: SupportView): void {
    this.confirming.set(false);
    this.actionError.set('');
    this.navigate({
      view: view === 'overview' ? null : view,
      request: null,
      page: null,
      status: null,
      card: null,
    });
  }
  protected selectKind(kind: RequestKind): void {
    this.navigate({ kind, request: null, page: null, status: null });
  }
  protected openWarrantyCard(id: string): void {
    this.navigate({ view: 'warranty', card: id, request: null, status: null, page: null });
  }
  protected filterStatus(status: string): void {
    this.navigate({ status: status || null, page: null });
  }
  protected page(page: number): void {
    this.navigate({ page });
  }
  protected openRequest(kind: RequestKind, id: string): void {
    this.confirming.set(false);
    this.actionError.set('');
    this.navigate({ view: 'requests', kind, request: id, page: null, status: null });
    this.refresh.next(0);
  }
  protected closeDetail(): void {
    this.navigate({ request: null });
  }
  protected isVideo(url: string): boolean {
    return /\.(mp4|mov)$/i.test(url);
  }
  protected statusClass(status: string): string {
    return status === 'COMPLETED'
      ? 'complete'
      : ['REJECTED', 'CANCELLED'].includes(status)
        ? 'closed'
        : 'pending';
  }
  protected cancelRequest(id: string): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.actionError.set('');
    this.returns
      .cancel(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.confirming.set(false);
          this.refresh.next(0);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.actionError.set(apiErrorMessage(error));
        },
      });
  }
  private navigate(queryParams: Record<string, string | number | null>): void {
    void this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
      })
      .then(() =>
        requestAnimationFrame(() =>
          this.contentNav()?.nativeElement.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          }),
        ),
      );
  }
}
