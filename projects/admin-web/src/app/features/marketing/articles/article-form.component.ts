import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ProductPickerComponent } from '../shared/product-picker.component';
import {
  ArticleApi,
  CATEGORIES,
  TYPE_LABEL,
  type ArticleAction,
  type ArticleBody,
  type ArticleRow,
  type ArticleType,
} from './article.api';

const toLocal = (iso: string): string => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** FR-MKT_AD-016: tạo và sửa bài viết / thông báo; Lưu nháp, Đăng ngay, Lên lịch. */
@Component({
  selector: 'app-article-form',
  imports: [FormsModule, RouterLink, ProductPickerComponent],
  templateUrl: './article-form.component.html',
  styleUrl: './article-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleFormComponent {
  private readonly api = inject(ArticleApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly CATEGORIES = CATEGORIES;
  protected readonly TYPES = Object.entries(TYPE_LABEL) as [ArticleType, string][];

  protected title = '';
  protected slug = '';
  protected type: ArticleType = 'ARTICLE';
  protected category = '';
  protected coverUrl = '';
  protected summary = '';
  protected content = '';
  protected tagsText = '';
  protected relatedProductIds: string[] = [];
  protected seoTitle = '';
  protected metaDescription = '';
  protected pinned = false;
  protected publishAt = '';

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal('');
  protected loaded: ArticleRow | null = null;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const a = (this.loaded = await firstValueFrom(this.api.get(id)));
      this.title = a.title;
      this.slug = a.slug ?? '';
      this.type = a.type;
      this.category = a.category ?? '';
      this.coverUrl = a.coverUrl ?? '';
      this.summary = a.summary;
      this.content = a.content ?? '';
      this.tagsText = a.tags.join(', ');
      this.relatedProductIds = a.relatedProductIds;
      this.seoTitle = a.seoTitle;
      this.metaDescription = a.metaDescription;
      this.pinned = a.pinned;
      this.publishAt = a.publishAt ? toLocal(a.publishAt) : '';
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async pickCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.uploading.set(true);
    try {
      this.coverUrl = (await firstValueFrom(this.api.uploadCover(file))).url;
    } catch (e) {
      this.error.set(parseApiError(e).message || 'Tải ảnh không thành công. Vui lòng thử lại.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(action: ArticleAction): Promise<void> {
    this.error.set('');
    if (action === 'SCHEDULE' && !this.publishAt) {
      this.error.set('Vui lòng chọn thời gian đăng.');
      return;
    }
    const body: ArticleBody = {
      title: this.title.trim(),
      slug: this.slug.trim() || undefined,
      type: this.type,
      category: this.type === 'ARTICLE' ? this.category || null : null,
      coverUrl: this.coverUrl || null,
      summary: this.summary.trim(),
      content: this.content,
      tags: this.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      relatedProductIds: this.relatedProductIds,
      seoTitle: this.seoTitle.trim(),
      metaDescription: this.metaDescription.trim(),
      pinned: this.type === 'ANNOUNCEMENT' && this.pinned,
      action,
      publishAt: action === 'SCHEDULE' ? new Date(this.publishAt).toISOString() : undefined,
    };
    this.saving.set(true);
    try {
      if (this.loaded) await firstValueFrom(this.api.update(this.loaded.id, { ...body, version: this.loaded.version }));
      else await firstValueFrom(this.api.create(body));
      await this.router.navigate(['/marketing/bai-viet']);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
