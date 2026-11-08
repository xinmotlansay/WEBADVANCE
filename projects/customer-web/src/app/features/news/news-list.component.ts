import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApiService, type ArticlePage, type ArticleType } from 'shared';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

const PAGE_SIZE = 12;
type State = { status: 'loading' } | { status: 'ok'; data: ArticlePage } | { status: 'error' };

const toType = (t: string | null): ArticleType | null =>
  t === 'ARTICLE' || t === 'ANNOUNCEMENT' ? t : null;

/** Danh sách tin tức: lọc Bài viết / Thông báo qua `?type=`, phân trang qua `?page=`. Thông báo ghim lên đầu (server sắp). */
@Component({
  selector: 'app-news-list',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="feature-page container">
      <h1>Tin tức</h1>
      <nav class="toolbar news-tabs" aria-label="Loại tin">
        @for (tab of tabs; track tab.label) {
          <a
            [routerLink]="[]"
            [queryParams]="{ type: tab.type, page: null }"
            [class.active]="type() === tab.type"
            [attr.aria-current]="type() === tab.type ? 'page' : null"
            >{{ tab.label }}</a
          >
        }
      </nav>

      @switch (state().status) {
        @case ('loading') {
          <p class="state" aria-live="polite">Đang tải…</p>
        }
        @case ('error') {
          <p class="state">Không tải được tin tức. Vui lòng thử lại sau.</p>
        }
        @case ('ok') {
          @if (page(); as p) {
            @if (!p.items.length) {
              <p class="state">Chưa có tin nào.</p>
            } @else {
              <ul class="news-grid">
                @for (a of p.items; track a.slug) {
                  <li>
                    <a class="news-card" [routerLink]="['/news', a.slug]">
                      <span class="news-card__media">
                        @if (a.coverUrl) {
                          <img [src]="a.coverUrl" [alt]="a.title" loading="lazy" />
                        }
                      </span>
                      <span class="eyebrow">
                        @if (a.pinned) {
                          <strong>Ghim · </strong>
                        }
                        {{ a.type === 'ANNOUNCEMENT' ? 'Thông báo' : (a.category ?? 'Bài viết') }}
                        @if (a.publishAt) {
                          · {{ a.publishAt | date: 'dd/MM/yyyy' }}
                        }
                      </span>
                      <span class="news-card__title">{{ a.title }}</span>
                      @if (a.summary) {
                        <span class="news-card__summary">{{ a.summary }}</span>
                      }
                    </a>
                  </li>
                }
              </ul>
              @if (pages() > 1) {
                <nav class="pagination" aria-label="Phân trang">
                  <a
                    [routerLink]="[]"
                    [queryParams]="{ page: p.page - 1 }"
                    queryParamsHandling="merge"
                    [class.disabled]="p.page <= 1"
                    [attr.aria-disabled]="p.page <= 1"
                    >‹ Trước</a
                  >
                  <span>Trang {{ p.page }} / {{ pages() }}</span>
                  <a
                    [routerLink]="[]"
                    [queryParams]="{ page: p.page + 1 }"
                    queryParamsHandling="merge"
                    [class.disabled]="p.page >= pages()"
                    [attr.aria-disabled]="p.page >= pages()"
                    >Sau ›</a
                  >
                </nav>
              }
            }
          }
        }
      }
    </main>
  `,
  styles: `
    .news-tabs {
      justify-content: flex-start;
    }
    .news-tabs a {
      padding-bottom: var(--space-xs);
      border-bottom: 2px solid transparent;
    }
    .news-tabs a.active {
      border-color: currentColor;
      font-weight: var(--font-weight-medium);
    }
    .news-grid {
      display: grid;
      gap: var(--space-xl) var(--grid-gutter);
      padding: 0;
      list-style: none;
    }
    .news-card {
      display: grid;
      gap: var(--space-xs);
    }
    .news-card .eyebrow {
      margin: var(--space-sm) 0 0;
    }
    .news-card__media {
      display: block;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: var(--color-surface);
      border-radius: var(--radius);
    }
    .news-card__media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .news-card__title {
      font-weight: var(--font-weight-medium);
    }
    .news-card__summary {
      color: var(--color-muted);
      font-size: var(--font-size-sm);
    }
    .pagination .disabled {
      pointer-events: none;
      opacity: 0.4;
    }
    @media (min-width: 768px) {
      .news-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class NewsListComponent {
  private readonly api = inject(CatalogApiService);
  private readonly query = inject(ActivatedRoute).queryParamMap;
  private readonly params = toSignal(this.query, { requireSync: true });

  protected readonly tabs: { label: string; type: ArticleType | null }[] = [
    { label: 'Tất cả', type: null },
    { label: 'Bài viết', type: 'ARTICLE' },
    { label: 'Thông báo', type: 'ANNOUNCEMENT' },
  ];

  protected readonly type = computed(() => toType(this.params().get('type')));

  protected readonly state = toSignal(
    this.query.pipe(
      switchMap((p) =>
        this.api
          .getArticles({
            type: toType(p.get('type')) ?? undefined,
            page: Math.max(1, Number(p.get('page')) || 1),
            pageSize: PAGE_SIZE,
          })
          .pipe(
            map((data): State => ({ status: 'ok', data })),
            catchError(() => of<State>({ status: 'error' })),
            startWith<State>({ status: 'loading' }),
          ),
      ),
    ),
    { initialValue: { status: 'loading' } as State },
  );

  protected readonly page = computed(() => {
    const s = this.state();
    return s.status === 'ok' ? s.data : null;
  });
  protected readonly pages = computed(() => {
    const p = this.page();
    return p ? Math.ceil(p.total / p.pageSize) : 0;
  });
}
