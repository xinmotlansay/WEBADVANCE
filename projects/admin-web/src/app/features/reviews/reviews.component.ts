import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, type Observable } from 'rxjs';
import {
  AdminApiService,
  apiMessage,
  type ModerationDecision,
  type ReviewQueue,
  type ReviewRow,
} from '../../core/api/admin-api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { BulkBarComponent } from '../../shared/ui/bulk-bar.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { DetailPopupComponent } from '../../shared/ui/detail-popup.component';
import { FilterChipComponent, type ChipOption } from '../../shared/ui/filter-chip.component';
import { NotificationBellComponent } from '../../shared/ui/notification-bell.component';
import { ToastService } from '../../shared/ui/toast';

const QUEUE_LABEL: Record<ReviewQueue, string> = {
  PENDING: 'Chờ duyệt',
  VISIBLE: 'Đang hiển thị',
  HIDDEN: 'Đã ẩn',
  REJECTED: 'Đã từ chối',
};

const REASON_OPTIONS = ['Ngôn từ xúc phạm', 'Spam hoặc quảng cáo', 'Thông tin cá nhân', 'Không liên quan sản phẩm', 'Hình ảnh không phù hợp'];

/** Thao tác đang chờ xác nhận lý do (ẩn, từ chối) cho một hoặc nhiều đánh giá. */
interface PendingAction {
  decision: Extract<ModerationDecision, 'HIDE' | 'REJECT'>;
  ids: string[];
  lowRating: boolean;
}

/** PA-09: hàng chờ duyệt (đánh giá bị khách báo cáo), giữ, ẩn hoặc từ chối; chỉ xử lý nội dung vi phạm. */
@Component({
  selector: 'app-reviews',
  imports: [
    IconComponent,
    BulkBarComponent,
    ConfirmDialogComponent,
    DetailPopupComponent,
    FilterChipComponent,
    NotificationBellComponent,
    ...FORMAT_PIPES,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.component.html',
  styleUrl: './reviews.component.css',
})
export class ReviewsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  protected readonly queues: ReviewQueue[] = ['PENDING', 'VISIBLE', 'HIDDEN', 'REJECTED'];
  protected readonly queueLabel = QUEUE_LABEL;
  protected readonly reasonOptions = REASON_OPTIONS;
  protected readonly ratingOptions: ChipOption[] = [5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} sao` }));

  protected readonly queue = signal<ReviewQueue>('PENDING');
  protected readonly ratingFilter = signal<string[]>([]);
  protected readonly searchText = signal('');
  private readonly search = toSignal(toObservable(this.searchText).pipe(debounceTime(300)), { initialValue: '' });
  protected readonly page = signal(1);

  protected readonly reviews = rxResource({
    request: () => ({
      queue: this.queue(),
      rating: this.ratingFilter()[0] ? Number(this.ratingFilter()[0]) : undefined,
      q: this.search().trim() || undefined,
      page: this.page(),
      limit: 20,
    }),
    loader: ({ request }) => this.api.reviews(request),
  });
  protected readonly rows = computed(() => this.reviews.value()?.data ?? []);
  protected readonly counts = computed(() => this.reviews.value()?.counts);
  protected readonly hasFilters = computed(() => !!this.search().trim() || this.ratingFilter().length > 0);
  protected readonly reasonTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const row of this.rows()) for (const r of row.reportReasons) totals.set(r.reason, (totals.get(r.reason) ?? 0) + r.count);
    return [...totals.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  });
  protected readonly reasonMax = computed(() => Math.max(1, ...this.reasonTotals().map((r) => r.count)));

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)));
  protected readonly open = signal<ReviewRow | null>(null);
  protected readonly pending = signal<PendingAction | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal('');

  protected stars(rating: number): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  protected setQueue(queue: ReviewQueue): void {
    this.queue.set(queue);
    this.open.set(null);
    this.reset();
  }

  protected setRating(values: string[]): void {
    this.ratingFilter.set(values);
    this.reset();
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.reset();
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.ratingFilter.set([]);
    this.reset();
  }

  protected toggleRow(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.rows().map((r) => r.id)));
  }

  protected selectedIds(): string[] {
    return [...this.selected()];
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected goPage(page: number): void {
    this.page.set(page);
    this.clearSelection();
  }

  /** Giữ hoặc hiện lại không cần lý do; ẩn và từ chối mở hộp ghi lý do. */
  protected act(decision: ModerationDecision, ids: string[]): void {
    if (decision === 'HIDE' || decision === 'REJECT') {
      const lowRating = this.rows().some((r) => ids.includes(r.id) && r.rating <= 2);
      this.dialogError.set('');
      this.pending.set({ decision, ids, lowRating });
      return;
    }
    this.run(decision, ids);
  }

  protected confirmPending(reason: string): void {
    const p = this.pending();
    if (p) this.run(p.decision, p.ids, reason);
  }

  protected pendingMessage(p: PendingAction): string {
    const base =
      p.decision === 'HIDE'
        ? 'Đánh giá bị ẩn khỏi trang sản phẩm, có thể hiện lại sau.'
        : 'Đánh giá bị gỡ do vi phạm và không còn hiển thị cho khách.';
    return p.lowRating
      ? `${base} Lưu ý: chỉ xử lý nội dung vi phạm, không ẩn đánh giá chê chỉ vì điểm thấp.`
      : base;
  }

  private run(decision: ModerationDecision, ids: string[], reason?: string): void {
    this.busy.set(true);
    const request: Observable<object> =
      ids.length === 1 ? this.api.moderateReview(ids[0], decision, reason) : this.api.bulkModerate(ids, decision, reason);
    request.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.pending.set(null);
        this.open.set(null);
        this.clearSelection();
        const failed = 'failed' in result ? (result as { failed: unknown[] }).failed.length : 0;
        const done = ids.length - failed;
        const verb = { KEEP: 'giữ hiển thị', HIDE: 'ẩn', REJECT: 'từ chối', RESTORE: 'hiện lại' }[decision];
        this.toast.show(`Đã ${verb} ${done} đánh giá${failed ? `, ${failed} không xử lý được` : ''}.`);
        this.reviews.reload();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (this.pending()) this.dialogError.set(apiMessage(error));
        else this.toast.show(apiMessage(error), 'error');
      },
    });
  }

  private reset(): void {
    this.page.set(1);
    this.clearSelection();
  }
}
