import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import {
  ArticleApi,
  CATEGORIES,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_LABEL,
  dateTime,
  type ArticleList,
  type ArticleRow,
} from './article.api';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: ArticleList };

/** FR-MKT_AD-016: danh sách bài viết và thông báo, lọc, ẩn / hiển thị lại. */
@Component({
  selector: 'app-article-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './article-list.component.html',
  styleUrl: './article-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleListComponent {
  private readonly api = inject(ArticleApi);

  protected readonly CATEGORIES = CATEGORIES;
  protected readonly TYPES = Object.entries(TYPE_LABEL);
  protected readonly STATUSES = Object.entries(STATUS_LABEL);
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;
  protected readonly TYPE_LABEL = TYPE_LABEL;
  protected readonly dateTime = dateTime;

  protected type = '';
  protected status = '';
  protected category = '';
  protected search = '';
  protected page = 1;
  protected readonly load = signal<Load>({ state: 'loading' });
  protected readonly error = signal('');

  constructor() {
    void this.reload();
  }

  protected hasFilter(): boolean {
    return !!(this.type || this.status || this.category || this.search);
  }

  protected async reload(page = 1): Promise<void> {
    this.page = page;
    this.load.set({ state: 'loading' });
    try {
      const data = await firstValueFrom(
        this.api.list({ type: this.type, status: this.status, category: this.category, q: this.search, page }),
      );
      this.load.set({ state: 'ready', data });
    } catch (e) {
      this.load.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  protected clearFilters(): void {
    this.type = this.status = this.category = this.search = '';
    void this.reload();
  }

  protected pages(d: ArticleList): number {
    return Math.max(1, Math.ceil(d.total / d.pageSize));
  }

  protected async toggleHidden(a: ArticleRow): Promise<void> {
    const hide = a.status !== 'HIDDEN';
    if (hide && !confirm(`Ẩn "${a.title}"? Bài sẽ không còn hiển thị trên website.`)) return;
    this.error.set('');
    try {
      await firstValueFrom(this.api.setHidden(a.id, hide));
      await this.reload(this.page);
    } catch (e) {
      this.error.set(parseApiError(e).message);
    }
  }
}
