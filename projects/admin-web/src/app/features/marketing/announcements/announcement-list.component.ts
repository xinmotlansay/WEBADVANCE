import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import {
  ANNOUNCEMENT_STATUS_BADGE,
  ANNOUNCEMENT_STATUS_LABEL,
  AnnouncementApi,
  type AnnouncementList,
  type AnnouncementRow,
  type AnnouncementStatus,
} from '../../../services/marketing/announcement.service';
import { ScheduleApi } from '../../../services/marketing/schedule.service';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';

type Tab = 'ALL' | AnnouncementStatus;
const TABS: Tab[] = ['ALL', 'ACTIVE', 'SCHEDULED', 'DRAFT', 'HIDDEN', 'ENDED'];

/** Thanh thông báo: nhiều thông báo cùng chạy sẽ hiện lần lượt trên website. Đăng riêng từng thông báo. */
@Component({
  selector: 'app-announcement-list',
  imports: [DatePipe, RouterLink, PublishDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-list.component.html',
  styleUrl: './announcement-list.component.css',
})
export class AnnouncementListComponent {
  private readonly api = inject(AnnouncementApi);
  private readonly schedule = inject(ScheduleApi);

  protected readonly TABS = TABS;
  protected readonly LABEL = ANNOUNCEMENT_STATUS_LABEL;
  protected readonly BADGE = ANNOUNCEMENT_STATUS_BADGE;

  protected readonly tab = signal<Tab>('ALL');
  protected readonly data = signal<AnnouncementList | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly publishing = signal<{ row: AnnouncementRow; reschedule: boolean } | null>(null);

  protected readonly rows = computed(() => {
    const d = this.data();
    if (!d) return [];
    return this.tab() === 'ALL' ? d.items : d.items.filter((r) => r.status === this.tab());
  });
  /** Các thông báo đang chạy theo thứ tự hiển thị trên website. */
  protected readonly active = computed(() => this.data()?.items.filter((r) => r.status === 'ACTIVE') ?? []);
  protected readonly previewIndex = signal(0);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.data.set(await firstValueFrom(this.api.list()));
    } catch (e) {
      this.loadError.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    this.message.set('');
  }

  private async run(fn: () => Promise<unknown>, ok: string): Promise<void> {
    this.error.set('');
    this.message.set('');
    this.busy.set(true);
    try {
      await fn();
      this.message.set(ok);
      await this.load();
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected openPublish(row: AnnouncementRow, reschedule: boolean): void {
    this.error.set('');
    this.publishing.set({ row, reschedule });
  }

  protected async confirmPublish(choice: PublishChoice): Promise<void> {
    const target = this.publishing();
    if (!target) return;
    await this.run(
      () =>
        target.reschedule && choice.publishAt
          ? firstValueFrom(this.schedule.reschedule('ANNOUNCEMENT', target.row.id, choice.publishAt))
          : firstValueFrom(this.api.publish(target.row.id, choice.publishAt)),
      choice.publishAt ? 'Đã lên lịch đăng thông báo.' : 'Đã đăng thông báo.',
    );
    if (!this.error()) this.publishing.set(null);
  }

  protected cancelSchedule(r: AnnouncementRow): void {
    if (!confirm('Hủy lịch đăng thông báo này? Thông báo sẽ quay về bản nháp.')) return;
    void this.run(() => firstValueFrom(this.schedule.cancel('ANNOUNCEMENT', r.id)), 'Đã hủy lịch, thông báo về bản nháp.');
  }

  protected toggleHidden(r: AnnouncementRow): void {
    const hide = r.status === 'ACTIVE' || r.status === 'SCHEDULED';
    if (hide && !confirm('Ẩn thông báo này? Khách sẽ không còn thấy nó.')) return;
    void this.run(() => firstValueFrom(this.api.setHidden(r.id, hide)), hide ? 'Đã ẩn thông báo.' : 'Đã hiển thị lại thông báo.');
  }

  protected remove(r: AnnouncementRow): void {
    if (!confirm('Xóa thông báo này? Thao tác không hoàn tác được.')) return;
    void this.run(() => firstValueFrom(this.api.remove(r.id)), 'Đã xóa thông báo.');
  }

  protected move(index: number, delta: -1 | 1): void {
    const d = this.data();
    if (!d) return;
    const ids = d.items.map((r) => r.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void this.run(() => firstValueFrom(this.api.reorder(ids)), 'Đã đổi thứ tự hiển thị.');
  }

  protected prev(): void {
    const n = this.active().length;
    this.previewIndex.update((i) => (i - 1 + n) % n);
  }

  protected next(): void {
    const n = this.active().length;
    this.previewIndex.update((i) => (i + 1) % n);
  }

  protected current = computed(() => {
    const list = this.active();
    return list.length ? list[this.previewIndex() % list.length]! : null;
  });
}
