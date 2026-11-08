import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ScheduleApi } from '../../../services/marketing/schedule.service';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';
import { CollectionApi, STATUS_BADGE, STATUS_LABEL, type CollectionRow } from '../../../services/marketing/collection.service';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: CollectionRow[] };

/** MA-07: danh sách collection, lọc, ẩn/hiện, xóa, đổi thứ tự hiển thị trên trang chủ. */
@Component({
  selector: 'app-collection-list',
  imports: [FormsModule, RouterLink, DatePipe, PublishDialogComponent],
  templateUrl: './collection-list.component.html',
  styleUrl: './collection-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionListComponent {
  private readonly api = inject(CollectionApi);
  private readonly schedule = inject(ScheduleApi);
  protected readonly publishing = signal<{ row: CollectionRow; reschedule: boolean } | null>(null);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly STATUSES = Object.entries(STATUS_LABEL);
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;

  protected status = '';
  protected search = '';
  protected readonly load = signal<Load>({ state: 'loading' });
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.reload();
  }

  /** Đổi thứ tự cần đủ danh sách nên chỉ bật khi không lọc. */
  protected hasFilter(): boolean {
    return !!(this.status || this.search);
  }

  /** `silent`: tải lại ngầm, không hiện khung chờ nên bảng không bị nháy. */
  protected async reload(silent = false): Promise<void> {
    if (!silent) this.load.set({ state: 'loading' });
    try {
      const rows = await firstValueFrom(this.api.list({ status: this.status, q: this.search }));
      this.load.set({ state: 'ready', rows });
    } catch (e) {
      if (silent) this.error.set(parseApiError(e).message);
      else this.load.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  protected clearFilters(): void {
    this.status = this.search = '';
    void this.reload();
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await fn();
      await this.reload(true);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected toggleHidden(c: CollectionRow): void {
    const hide = c.status === 'VISIBLE';
    if (hide && !confirm(`Ẩn "${c.name}"? Khách sẽ không còn thấy bộ sưu tập này.`)) return;
    void this.run(() => firstValueFrom(this.api.setHidden(c.id, hide)));
  }

  protected openPublish(row: CollectionRow, reschedule: boolean): void {
    this.error.set('');
    this.publishing.set({ row, reschedule });
  }

  protected async confirmPublish(choice: PublishChoice): Promise<void> {
    const target = this.publishing();
    if (!target) return;
    await this.run(() =>
      target.reschedule && choice.publishAt
        ? firstValueFrom(this.schedule.reschedule('COLLECTION', target.row.id, choice.publishAt))
        : firstValueFrom(this.api.setHidden(target.row.id, false, choice.publishAt)),
    );
    if (!this.error()) this.publishing.set(null);
  }

  protected cancelSchedule(c: CollectionRow): void {
    if (!confirm(`Hủy lịch đăng "${c.name}"? Bộ sưu tập sẽ quay về trạng thái ẩn.`)) return;
    void this.run(() => firstValueFrom(this.schedule.cancel('COLLECTION', c.id)));
  }

  protected remove(c: CollectionRow): void {
    if (!confirm(`Xóa vĩnh viễn "${c.name}"? Thao tác này không hoàn tác được.`)) return;
    void this.run(() => firstValueFrom(this.api.remove(c.id)));
  }

  protected move(rows: CollectionRow[], index: number, delta: -1 | 1): void {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    this.load.set({ state: 'ready', rows: next });
    void this.run(() => firstValueFrom(this.api.reorder(next.map((r) => r.id))));
  }

  /** Bấm vào đâu trên hàng cũng mở trang chi tiết, trừ nút và liên kết có việc riêng. */
  protected openRow(e: MouseEvent, c: CollectionRow): void {
    if ((e.target as HTMLElement).closest('button, a')) return;
    void this.router.navigate([c.id, 'sua'], { relativeTo: this.route });
  }

  protected readonly dragId = signal<string | null>(null);
  protected readonly overId = signal<string | null>(null);

  protected dragStart(e: DragEvent, c: CollectionRow): void {
    if (this.hasFilter() || this.busy()) return e.preventDefault();
    this.dragId.set(c.id);
    e.dataTransfer?.setData('text/plain', c.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected dragOver(e: DragEvent, c: CollectionRow): void {
    if (!this.dragId()) return;
    e.preventDefault();
    this.overId.set(c.id);
  }

  protected dragEnd(): void {
    this.dragId.set(null);
    this.overId.set(null);
  }

  protected drop(e: DragEvent, rows: CollectionRow[], target: CollectionRow): void {
    e.preventDefault();
    const from = rows.findIndex((r) => r.id === this.dragId());
    const to = rows.findIndex((r) => r.id === target.id);
    this.dragEnd();
    if (from < 0 || to < 0 || from === to) return;
    const next = [...rows];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    this.load.set({ state: 'ready', rows: next });
    void this.run(() => firstValueFrom(this.api.reorder(next.map((r) => r.id))));
  }
}
