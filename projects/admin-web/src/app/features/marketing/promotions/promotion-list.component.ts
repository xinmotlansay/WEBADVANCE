import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { dateTime, money } from '../vouchers/voucher-format';
import {
  PromotionApi,
  type PromotionDetail,
  type PromotionQuery,
  type PromotionRow,
} from './promotion.api';
import {
  PROMO_BADGE,
  PROMO_LABEL,
  PROMO_REASONS,
  WARNING_TEXT,
  promoDiscountText,
  promotionsToCsv,
} from './promotion-format';

type Mode = 'loading' | 'error' | 'ready';
type DialogKind = 'pause' | 'end' | 'delete';

interface Bar {
  row: PromotionRow;
  left: number;
  width: number;
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

/** FR-MKT_AD-003/006: danh sách + lịch, chi tiết, tạm dừng / tiếp tục / kết thúc sớm / xóa / nhân bản. */
@Component({
  selector: 'app-promotion-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './promotion-list.component.html',
  styleUrl: './promotion-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closePopup()' },
})
export class PromotionListComponent {
  private readonly api = inject(PromotionApi);

  protected readonly LABEL = PROMO_LABEL;
  protected readonly BADGE = PROMO_BADGE;
  protected readonly REASONS = PROMO_REASONS;
  protected readonly WARN = WARNING_TEXT;
  protected readonly money = money;
  protected readonly dateTime = dateTime;
  protected readonly discountText = promoDiscountText;
  protected readonly statuses = Object.entries(PROMO_LABEL);
  protected readonly emptySet: ReadonlySet<string> = new Set();

  protected readonly view = signal<'list' | 'calendar'>('list');
  protected readonly mode = signal<Mode>('loading');
  protected readonly error = signal('');
  protected readonly rows = signal<PromotionRow[]>([]);
  protected readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  protected readonly filter = signal<PromotionQuery>({ page: 1, limit: 20 });
  protected readonly search = signal('');
  protected readonly searchError = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(this.emptySet);
  protected readonly notice = signal('');
  protected readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  protected readonly hasFilter = computed(() => {
    const f = this.filter();
    return !!(f.q || f.type || f.status);
  });
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)),
  );
  protected readonly monthLabel = computed(
    () => `${MONTH_NAMES[this.month().getMonth()]} ${this.month().getFullYear()}`,
  );
  protected readonly days = computed(() => {
    const m = this.month();
    return Array.from(
      { length: new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() },
      (_, i) => i + 1,
    );
  });
  /** Thanh thời gian: vị trí và độ rộng theo phần trăm của tháng đang xem. */
  protected readonly bars = computed<Bar[]>(() => {
    const m = this.month();
    const from = m.getTime();
    const span = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime() - from;
    return this.rows().flatMap((row) => {
      if (!row.startDate || !row.endDate) return [];
      const s = Math.max(new Date(row.startDate).getTime(), from);
      const e = Math.min(new Date(row.endDate).getTime(), from + span);
      return e > s
        ? [{ row, left: ((s - from) / span) * 100, width: Math.max(((e - s) / span) * 100, 1) }]
        : [];
    });
  });

  // Popup chi tiết
  protected readonly detail = signal<PromotionDetail | null>(null);
  private opener: HTMLElement | null = null;
  private readonly popup = viewChild<ElementRef<HTMLElement>>('popup');

  // Hộp thoại lý do / xác nhận
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly dialogKind = signal<DialogKind>('pause');
  protected readonly dialogIds = signal<string[]>([]);
  protected reason = 'PLAN_CHANGED';
  protected note = '';
  protected readonly dialogError = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.mode.set('loading');
    try {
      const f = { ...this.filter() };
      if (this.view() === 'calendar') {
        const m = this.month();
        f.from = m.toISOString();
        f.to = new Date(m.getFullYear(), m.getMonth() + 1, 1).toISOString();
        f.page = 1;
        f.limit = 100;
      }
      const page = await firstValueFrom(this.api.list(f));
      this.rows.set(page.data);
      this.meta.set(page.meta);
      this.selected.set(this.emptySet);
      this.mode.set('ready');
    } catch (e) {
      this.error.set(parseApiError(e).message);
      this.mode.set('error');
    }
  }

  protected setView(v: 'list' | 'calendar'): void {
    this.view.set(v);
    void this.load();
  }

  protected shiftMonth(delta: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
    void this.load();
  }

  protected setFilter(patch: Partial<PromotionQuery>): void {
    this.filter.update((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
    void this.load();
  }

  protected submitSearch(): void {
    const q = this.search().trim();
    if (q && (q.length < 2 || q.length > 100)) {
      this.searchError.set('Vui lòng nhập từ 2 đến 100 ký tự để tìm kiếm.');
      return;
    }
    this.searchError.set('');
    this.setFilter({ q });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.searchError.set('');
    this.filter.set({ page: 1, limit: this.filter().limit });
    void this.load();
  }

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? this.emptySet : new Set(this.rows().map((r) => r.id)));
  }

  protected pages(): number[] {
    const { page, totalPages } = this.meta();
    const from = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => from + i);
  }

  protected async open(row: PromotionRow, event: Event): Promise<void> {
    this.opener = event.currentTarget as HTMLElement;
    try {
      this.detail.set(await firstValueFrom(this.api.get(row.id)));
      setTimeout(() => this.popup()?.nativeElement.focus());
    } catch (e) {
      this.notice.set(parseApiError(e).message);
    }
  }

  protected closePopup(): void {
    if (!this.detail()) return;
    this.detail.set(null);
    this.opener?.focus();
  }

  protected openDialog(kind: DialogKind, ids: string[]): void {
    this.dialogKind.set(kind);
    this.dialogIds.set(ids);
    this.reason = 'PLAN_CHANGED';
    this.note = '';
    this.dialogError.set('');
    this.dialog()?.nativeElement.showModal();
  }

  protected endSelected(): void {
    this.openDialog('end', [...this.selected()]);
  }

  protected noteRequired(): boolean {
    return this.reason === 'OTHER' || this.reason === 'WRONG_CONFIG';
  }

  protected async confirmDialog(): Promise<void> {
    const kind = this.dialogKind();
    const note = this.note.trim();
    if (kind !== 'delete' && this.noteRequired() && note.length < 10) {
      this.dialogError.set('Vui lòng chọn lý do và nhập ghi chú từ 10 ký tự (nếu bắt buộc).');
      return;
    }
    this.busy.set(true);
    try {
      const ids = this.dialogIds();
      if (kind === 'delete') await firstValueFrom(this.api.remove(ids[0]));
      else if (kind === 'pause')
        await firstValueFrom(this.api.pause(ids[0], this.reason, note || undefined));
      else await firstValueFrom(this.api.end(ids, this.reason, note || undefined));
      this.dialog()?.nativeElement.close();
      this.detail.set(null);
      this.notice.set(
        kind === 'delete'
          ? 'Đã xóa chương trình.'
          : kind === 'pause'
            ? 'Đã tạm dừng chương trình; giá trên website trở về giá gốc.'
            : `Đã kết thúc ${ids.length} chương trình.`,
      );
      await this.load();
    } catch (e) {
      this.dialogError.set(parseApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Tiếp tục / hủy kích hoạt / nhân bản: không cần lý do. */
  protected async quick(id: string, name: 'resume' | 'deactivate' | 'duplicate'): Promise<void> {
    try {
      const result = await firstValueFrom(this.api.action(id, name));
      this.detail.set(null);
      this.notice.set(
        name === 'duplicate'
          ? `Đã tạo bản nháp ${result.code}. Mở để chọn thời gian và kích hoạt.`
          : name === 'resume'
            ? 'Đã tiếp tục chương trình.'
            : 'Đã hủy kích hoạt, chương trình về trạng thái Nháp.',
      );
      await this.load();
    } catch (e) {
      this.notice.set(parseApiError(e).message);
    }
  }

  /** Xuất toàn bộ kết quả đang lọc (duyệt từng trang 100 dòng, tối đa 10.000 dòng). */
  protected async exportCsv(): Promise<void> {
    try {
      const all: PromotionRow[] = [];
      for (let page = 1, last = 1; page <= last && all.length < 10_000; page++) {
        const res = await firstValueFrom(this.api.list({ ...this.filter(), page, limit: 100 }));
        all.push(...res.data);
        last = res.meta.totalPages;
      }
      const url = URL.createObjectURL(
        new Blob([promotionsToCsv(all)], { type: 'text/csv;charset=utf-8' }),
      );
      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[-:T]/g, (c) => (c === 'T' ? '_' : ''));
      Object.assign(document.createElement('a'), {
        href: url,
        download: `KhuyenMai_${stamp}.csv`,
      }).click();
      URL.revokeObjectURL(url);
    } catch {
      this.notice.set('Không thể xuất file. Vui lòng thu hẹp bộ lọc hoặc thử lại.');
    }
  }

  protected warnText(l: {
    warnings: string[];
    priceChangedFrom: number | null;
    price: number;
  }): string {
    return l.warnings
      .map((w) =>
        w === 'PRICE_CHANGED' && l.priceChangedFrom != null
          ? `Giá gốc đã thay đổi từ ${money(l.priceChangedFrom)} thành ${money(l.price)}`
          : (WARNING_TEXT[w] ?? w),
      )
      .join('; ');
  }
}
