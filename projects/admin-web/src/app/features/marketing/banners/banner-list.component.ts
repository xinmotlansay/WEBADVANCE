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
import { BannerApi, type BannerList, type BannerPosition, type BannerRow } from '../../../services/marketing/banner.service';
import {
  POSITION_LABEL,
  POSITION_ORDER,
  RECOMMENDED,
  STATUS_BADGE,
  STATUS_LABEL,
  dateTime,
  pct,
} from './banner-format';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: BannerList };
type DialogMode = 'delete' | 'duplicate' | 'preview';

/** FR-MKT_AD-011/013/014: danh sách banner theo vị trí, kéo thả thứ tự, tạm ẩn, nhân bản, xóa. */
@Component({
  selector: 'app-banner-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './banner-list.component.html',
  styleUrl: './banner-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenus($event)' },
})
export class BannerListComponent {
  private readonly api = inject(BannerApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly POSITIONS = POSITION_ORDER;
  protected readonly POSITION_LABEL = POSITION_LABEL;
  protected readonly RECOMMENDED = RECOMMENDED;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;
  protected readonly STATUSES = Object.entries(STATUS_LABEL);
  protected readonly dateTime = dateTime;
  protected readonly pct = pct;

  protected readonly position = signal<BannerPosition>('HOME_SLIDER');
  protected readonly status = signal('');
  protected search = '';
  protected readonly load = signal<Load>({ state: 'loading' });
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly broken = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly dragId = signal('');

  protected readonly rows = computed(() => (this.load().state === 'ready' ? (this.load() as { data: BannerList }).data.items : []));
  protected readonly emptySet: ReadonlySet<string> = new Set();
  protected hasFilter(): boolean {
    return !!this.status() || !!this.search;
  }
  /** Chỉ cho kéo thả khi đang xem đủ banner của vị trí. */
  protected canReorder(): boolean {
    return !this.hasFilter() && this.rows().length > 1;
  }

  protected dialogMode = signal<DialogMode>('delete');
  protected readonly dialogRows = signal<BannerRow[]>([]);
  protected readonly dialogError = signal('');
  protected dupTarget: BannerPosition = 'HOME_MIDDLE';
  protected previewMobile = signal(false);
  private opener: HTMLElement | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.load.set({ state: 'loading' });
    this.selected.set(new Set());
    try {
      this.load.set({
        state: 'ready',
        data: await firstValueFrom(this.api.list(this.position(), this.status() || undefined, this.search || undefined)),
      });
    } catch (e) {
      this.load.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  protected setPosition(p: BannerPosition): void {
    this.position.set(p);
    this.status.set('');
    this.search = '';
    void this.reload();
  }

  protected clearFilters(): void {
    this.status.set('');
    this.search = '';
    void this.reload();
  }

  protected toggle(id: string): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) next.add(id);
    this.selected.set(next);
  }

  protected markBroken(id: string): void {
    this.broken.update((s) => new Set(s).add(id));
  }

  protected async run(action: () => Promise<unknown>, ok: string): Promise<void> {
    this.error.set('');
    this.message.set('');
    try {
      await action();
      this.message.set(ok);
      await this.reload();
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  protected toggleHidden(r: BannerRow): Promise<void> {
    return r.status === 'HIDDEN'
      ? this.run(() => firstValueFrom(this.api.show(r.id)), `Đã hiển thị lại ${r.code}.`)
      : this.run(() => firstValueFrom(this.api.hide(r.id)), `Đã tạm ẩn ${r.code}.`);
  }

  protected hideSelected(): Promise<void> {
    const ids = [...this.selected()];
    const rows = this.rows().filter((r) => ids.includes(r.id) && (r.status === 'VISIBLE' || r.status === 'SCHEDULED'));
    return this.run(async () => {
      for (const r of rows) await firstValueFrom(this.api.hide(r.id));
    }, `Đã tạm ẩn ${rows.length} banner.`);
  }

  /** Đổi chỗ bằng kéo thả hoặc nút Lên/Xuống, rồi lưu thứ tự 1..n cho cả vị trí. */
  protected move(from: number, to: number): Promise<void> {
    const ids = this.rows().map((r) => r.id);
    if (to < 0 || to >= ids.length || from === to) return Promise.resolve();
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    return this.run(() => firstValueFrom(this.api.reorder(this.position(), ids)), 'Đã cập nhật thứ tự.');
  }

  protected drop(targetId: string): void {
    const ids = this.rows().map((r) => r.id);
    const from = ids.indexOf(this.dragId());
    this.dragId.set('');
    if (from >= 0) void this.move(from, ids.indexOf(targetId));
  }

  protected open(mode: DialogMode, rows: BannerRow[], event?: Event): void {
    this.opener = (event?.currentTarget as HTMLElement) ?? null;
    this.dialogMode.set(mode);
    this.dialogRows.set(rows);
    this.dialogError.set('');
    this.previewMobile.set(false);
    this.dialog()?.nativeElement.showModal();
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
    this.opener?.focus();
  }

  protected async confirm(): Promise<void> {
    const rows = this.dialogRows();
    this.dialogError.set('');
    try {
      if (this.dialogMode() === 'delete') {
        await firstValueFrom(this.api.remove(rows.map((r) => r.id)));
        this.message.set(`Đã xóa ${rows.length} banner.`);
      } else {
        const copy = await firstValueFrom(this.api.duplicate(rows[0]!.id, this.dupTarget));
        this.message.set(`Đã nhân bản thành ${copy.code} (bản nháp) ở vị trí mới.`);
      }
      this.close();
      await this.reload();
    } catch (e) {
      this.dialogError.set(parseApiError(e).message);
    }
  }

  /** Đóng menu thao tác phụ đang mở (trừ menu vừa được bấm vào nút mở). */
  protected closeMenus(event?: Event): void {
    const keep = (event?.target as HTMLElement | undefined)?.closest?.('details.menu');
    this.host.nativeElement.querySelectorAll('details.menu[open]').forEach((d) => {
      if (d !== keep) d.removeAttribute('open');
    });
  }

  protected selectedRows(): BannerRow[] {
    return this.rows().filter((r) => this.selected().has(r.id));
  }
}
