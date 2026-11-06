import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { CollectionApi, STATUS_BADGE, STATUS_LABEL, type CollectionRow } from '../../../services/marketing/collection.service';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: CollectionRow[] };

/** MA-07: danh sách collection, lọc, ẩn/hiện, xóa, đổi thứ tự hiển thị trên trang chủ. */
@Component({
  selector: 'app-collection-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './collection-list.component.html',
  styleUrl: './collection-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionListComponent {
  private readonly api = inject(CollectionApi);

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

  protected async reload(): Promise<void> {
    this.load.set({ state: 'loading' });
    try {
      const rows = await firstValueFrom(this.api.list({ status: this.status, q: this.search }));
      this.load.set({ state: 'ready', rows });
    } catch (e) {
      this.load.set({ state: 'error', message: parseApiError(e).message });
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
      await this.reload();
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

  protected remove(c: CollectionRow): void {
    if (!confirm(`Xóa vĩnh viễn "${c.name}"? Thao tác này không hoàn tác được.`)) return;
    void this.run(() => firstValueFrom(this.api.remove(c.id)));
  }

  protected move(rows: CollectionRow[], index: number, delta: -1 | 1): void {
    const ids = rows.map((r) => r.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void this.run(() => firstValueFrom(this.api.reorder(ids)));
  }
}
