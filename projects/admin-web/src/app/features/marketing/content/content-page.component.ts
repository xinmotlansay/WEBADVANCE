import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';
import {
  ContentApi,
  type BarData,
  type SaveAction,
  type VersionRow,
} from '../../../services/marketing/content.service';

const PATH = 'ANNOUNCEMENT_BAR';

const toLocal = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const toIso = (local: string): string => (local ? new Date(local).toISOString() : '');

/** FR-MKT_AD-015: soạn thanh thông báo (bật/tắt, liên kết, thời gian hiển thị). */
@Component({
  selector: 'app-content-page',
  imports: [DatePipe, FormsModule, PublishDialogComponent],
  templateUrl: './content-page.component.html',
  styleUrl: './content-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentPageComponent {
  private readonly api = inject(ContentApi);

  protected readonly versions = signal<VersionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly warnings = signal<string[]>([]);
  protected readonly scheduledAt = signal<string | null>(null);
  protected readonly hasPublished = signal(false);
  protected readonly publishOpen = signal(false);
  protected readonly status = computed(() => {
    if (this.scheduledAt()) return { label: 'Đã hẹn đăng', cls: 'cv-badge--info' };
    if (this.hasPublished()) return { label: 'Đang hiển thị', cls: 'cv-badge--success' };
    return { label: 'Chưa đăng', cls: 'cv-badge--neutral' };
  });
  protected bar: BarData = { enabled: false, text: '', linkUrl: '', startAt: '', endAt: '' };
  protected publishAt = '';
  private version = 0;

  constructor() {
    void this.load();
  }

  protected togglePublish(): void {
    this.publishOpen.set(!this.publishOpen());
    this.error.set('');
  }

  @HostListener('document:keydown.escape')
  protected closePublish(): void {
    this.publishOpen.set(false);
  }

  protected async confirmPublish(choice: PublishChoice): Promise<void> {
    if (choice.publishAt) this.publishAt = toLocal(choice.publishAt.toISOString());
    await this.save(choice.publishAt ? 'SCHEDULE' : 'PUBLISH');
    if (!this.error()) this.publishOpen.set(false);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.error.set('');
    try {
      const a = await firstValueFrom(this.api.get<BarData>(PATH));
      this.bar = { ...a.draft, startAt: toLocal(a.draft.startAt), endAt: toLocal(a.draft.endAt) };
      this.version = a.version;
      this.warnings.set(a.warnings);
      this.scheduledAt.set(a.scheduledAt);
      this.hasPublished.set(!!a.published);
      this.versions.set(await firstValueFrom(this.api.versions(PATH)));
    } catch (e) {
      this.loadError.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async restore(v: VersionRow): Promise<void> {
    if (!confirm('Khôi phục thành bản nháp mới? Bản đang đăng không bị thay đổi.')) return;
    this.error.set('');
    try {
      await firstValueFrom(this.api.restore(PATH, v.id, this.version));
      await this.load();
      this.message.set('Đã khôi phục thành bản nháp. Kiểm tra rồi đăng nếu muốn áp dụng.');
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }

  protected async save(action: SaveAction): Promise<void> {
    this.error.set('');
    this.message.set('');
    if (action === 'SCHEDULE' && !this.publishAt) {
      this.error.set('Vui lòng chọn thời gian đăng.');
      return;
    }
    this.saving.set(true);
    try {
      const r = await firstValueFrom(
        this.api.save<unknown>(PATH, {
          data: { ...this.bar, startAt: toIso(this.bar.startAt), endAt: toIso(this.bar.endAt) },
          action,
          publishAt: action === 'SCHEDULE' ? new Date(this.publishAt).toISOString() : undefined,
          version: this.version,
        }),
      );
      this.version = r.version;
      this.warnings.set(r.warnings);
      this.scheduledAt.set(r.scheduledAt);
      this.hasPublished.set(!!r.published);
      this.versions.set(await firstValueFrom(this.api.versions(PATH)));
      this.message.set(
        (action === 'DRAFT' ? 'Đã lưu nháp.' : action === 'PUBLISH' ? 'Đã đăng.' : 'Đã lên lịch đăng.') +
          (r.warning ? ' ' + r.warning : ''),
      );
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
