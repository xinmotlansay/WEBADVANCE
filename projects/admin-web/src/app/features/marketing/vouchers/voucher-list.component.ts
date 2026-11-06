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
import { VoucherApi, type VoucherDetail, type VoucherQuery, type VoucherRow } from './voucher.api';
import {
  REASONS,
  STATUS_BADGE,
  STATUS_LABEL,
  dateTime,
  discountText,
  money,
  toCsv,
} from './voucher-format';

type Mode = 'loading' | 'error' | 'ready';

/** FR-MKT_AD-007/010: danh sách, chi tiết (popup), vô hiệu hóa / kích hoạt lại, xuất CSV. */
@Component({
  selector: 'app-voucher-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './voucher-list.component.html',
  styleUrl: './voucher-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closePopup()' },
})
export class VoucherListComponent {
  private readonly api = inject(VoucherApi);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;
  protected readonly REASONS = REASONS;
  protected readonly money = money;
  protected readonly dateTime = dateTime;
  protected readonly discountText = discountText;
  protected readonly statuses = Object.entries(STATUS_LABEL);

  protected readonly mode = signal<Mode>('loading');
  protected readonly error = signal('');
  protected readonly rows = signal<VoucherRow[]>([]);
  protected readonly meta = signal({ page: 1, limit: 20, total: 0, totalPages: 1 });
  protected readonly filter = signal<VoucherQuery>({ page: 1, limit: 20 });
  protected readonly search = signal('');
  protected readonly searchError = signal('');
  protected readonly emptySet: ReadonlySet<string> = new Set();
  protected readonly selected = signal<ReadonlySet<string>>(this.emptySet);
  protected readonly notice = signal('');

  protected readonly hasFilter = computed(() => {
    const f = this.filter();
    return !!(f.q || f.status || f.discountType || f.visibility);
  });
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)),
  );
  protected readonly filterCount = computed(() => {
    const f = this.filter();
    return [f.q, f.status, f.discountType, f.visibility].filter(Boolean).length;
  });

  // Popup chi tiết
  protected readonly detail = signal<VoucherDetail | null>(null);
  private opener: HTMLElement | null = null;
  private readonly popup = viewChild<ElementRef<HTMLElement>>('popup');

  // Hộp thoại lý do
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly dialogMode = signal<'disable' | 'enable'>('disable');
  protected readonly dialogIds = signal<string[]>([]);
  protected reason = 'WRONG_CONFIG';
  protected note = '';
  protected readonly dialogError = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.mode.set('loading');
    try {
      const page = await firstValueFrom(this.api.list(this.filter()));
      this.rows.set(page.data);
      this.meta.set(page.meta);
      this.selected.set(new Set());
      this.mode.set('ready');
    } catch (e) {
      this.error.set(parseApiError(e).message);
      this.mode.set('error');
    }
  }

  protected setFilter(patch: Partial<VoucherQuery>): void {
    this.filter.update((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
    void this.load();
  }

  protected submitSearch(): void {
    const q = this.search().trim();
    if (q && (q.length < 2 || q.length > 50)) {
      this.searchError.set('Vui lòng nhập từ 2 đến 50 ký tự để tìm kiếm.');
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
    this.selected.set(this.allSelected() ? new Set() : new Set(this.rows().map((r) => r.id)));
  }

  protected pages(): number[] {
    const { page, totalPages } = this.meta();
    const from = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => from + i);
  }

  protected async open(row: VoucherRow, event: Event): Promise<void> {
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

  protected async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.notice.set(`Đã sao chép mã ${code}`);
    } catch {
      this.notice.set('Không sao chép được, vui lòng chọn và sao chép thủ công.');
    }
  }

  protected openDialog(mode: 'disable' | 'enable', ids: string[]): void {
    this.dialogMode.set(mode);
    this.dialogIds.set(ids);
    this.reason = 'WRONG_CONFIG';
    this.note = '';
    this.dialogError.set('');
    this.dialog()?.nativeElement.showModal();
  }

  protected disableSelected(): void {
    this.openDialog('disable', [...this.selected()]);
  }

  protected noteRequired(): boolean {
    return this.reason === 'OTHER' || this.reason === 'LEAKED_OR_ABUSED';
  }

  protected async confirmDialog(): Promise<void> {
    const mode = this.dialogMode();
    const note = this.note.trim();
    if (mode === 'enable' ? !note : this.noteRequired() && note.length < 10) {
      this.dialogError.set(
        mode === 'enable'
          ? 'Vui lòng nhập lý do kích hoạt lại.'
          : 'Vui lòng chọn lý do và nhập ghi chú từ 10 ký tự (nếu bắt buộc).',
      );
      return;
    }
    this.busy.set(true);
    try {
      const ids = this.dialogIds();
      if (mode === 'enable') await firstValueFrom(this.api.enable(ids[0], note));
      else await firstValueFrom(this.api.disable(ids, this.reason, note || undefined));
      this.dialog()?.nativeElement.close();
      this.detail.set(null);
      this.notice.set(
        mode === 'enable' ? 'Đã kích hoạt lại mã.' : `Đã vô hiệu hóa ${ids.length} mã.`,
      );
      await this.load();
    } catch (e) {
      this.dialogError.set(parseApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Xuất toàn bộ kết quả đang lọc (duyệt từng trang 100 dòng). */
  protected async exportCsv(): Promise<void> {
    try {
      const all: VoucherRow[] = [];
      for (let page = 1, last = 1; page <= last; page++) {
        const res = await firstValueFrom(this.api.list({ ...this.filter(), page, limit: 100 }));
        all.push(...res.data);
        last = res.meta.totalPages;
      }
      const url = URL.createObjectURL(new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: 'ma-giam-gia.csv',
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.notice.set(parseApiError(e).message);
    }
  }

  protected percent(v: { usedCount: number; totalUsageLimit: number | null }): number {
    return v.totalUsageLimit
      ? Math.min(100, Math.round((v.usedCount / v.totalUsageLimit) * 100))
      : 0;
  }

  protected canDisable(r: { status: string }): boolean {
    return r.status === 'ACTIVE' || r.status === 'UPCOMING' || r.status === 'USED_UP';
  }
}
