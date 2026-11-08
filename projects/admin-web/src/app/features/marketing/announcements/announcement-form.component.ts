import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { AnnouncementApi, type AnnouncementRow } from '../../../services/marketing/announcement.service';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';

const toLocal = (iso: string): string => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Soạn một thông báo: nội dung, liên kết, giờ kết thúc, xem trước ngay bên cạnh. Đăng ở cuối form. */
@Component({
  selector: 'app-announcement-form',
  imports: [FormsModule, RouterLink, PublishDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-form.component.html',
  styleUrl: './announcement-form.component.css',
})
export class AnnouncementFormComponent {
  private readonly api = inject(AnnouncementApi);
  private readonly router = inject(Router);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected text = '';
  protected linkUrl = '';
  protected endAt = '';
  protected readonly loaded = signal<AnnouncementRow | null>(null);
  protected readonly loading = signal(!!this.id);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly publishOpen = signal(false);

  constructor() {
    if (this.id) void this.load(this.id);
  }

  private async load(id: string): Promise<void> {
    try {
      const a = await firstValueFrom(this.api.get(id));
      this.loaded.set(a);
      this.text = a.text;
      this.linkUrl = a.linkUrl;
      this.endAt = a.endAt ? toLocal(a.endAt) : '';
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Chưa đăng (hoặc đang tạo mới) thì có nút Đăng riêng; đã đăng thì chỉ lưu thay đổi. */
  protected get isDraft(): boolean {
    const a = this.loaded();
    return !a || a.status === 'DRAFT';
  }

  private body() {
    return { text: this.text.trim(), linkUrl: this.linkUrl.trim(), endAt: this.endAt ? new Date(this.endAt).toISOString() : null };
  }

  /** Lưu (tạo mới hoặc cập nhật) và trả về bản ghi. */
  private async persist(): Promise<AnnouncementRow | null> {
    this.error.set('');
    this.saving.set(true);
    try {
      const a = this.loaded();
      const saved = a
        ? await firstValueFrom(this.api.update(a.id, { ...this.body(), version: a.version }))
        : await firstValueFrom(this.api.create(this.body()));
      this.loaded.set(saved);
      return saved;
    } catch (e) {
      this.error.set(parseApiError(e).message);
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (await this.persist()) await this.router.navigate(['/marketing/thanh-thong-bao']);
  }

  /** Lưu nháp trước để hộp thoại đăng đúng nội dung vừa soạn. */
  protected async openPublish(): Promise<void> {
    if (await this.persist()) this.publishOpen.set(true);
  }

  protected async confirmPublish(choice: PublishChoice): Promise<void> {
    const a = this.loaded();
    if (!a) return;
    this.error.set('');
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.publish(a.id, choice.publishAt));
      await this.router.navigate(['/marketing/thanh-thong-bao']);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
