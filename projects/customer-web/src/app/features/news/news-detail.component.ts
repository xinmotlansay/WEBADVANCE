import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, Title, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogApiService, type ArticleDetail } from 'shared';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

type State =
  | { status: 'loading' }
  | { status: 'ok'; article: ArticleDetail }
  | { status: 'not-found' }
  | { status: 'error' };

/** Chi tiết bài viết `/news/:slug`. Bài nháp / ẩn / chưa đến giờ đăng → server 404. */
@Component({
  selector: 'app-news-detail',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // HTML bài viết gắn qua innerHTML không có thuộc tính đóng gói, nên style phải toàn cục;
  // mọi selector đều nằm dưới `.news-detail` để không lan ra trang khác.
  encapsulation: ViewEncapsulation.None,
  template: `
    <main class="feature-page container news-detail">
      @switch (state().status) {
        @case ('loading') {
          <p class="state" aria-live="polite">Đang tải…</p>
        }
        @case ('not-found') {
          <section class="state">
            <h1>Không tìm thấy bài viết</h1>
            <p>Bài viết không tồn tại hoặc đã được gỡ.</p>
            <a class="button" routerLink="/news">Xem tin tức khác</a>
          </section>
        }
        @case ('error') {
          <section class="state">
            <h1>Không tải được bài viết</h1>
            <a class="button" routerLink="/news">Về trang tin tức</a>
          </section>
        }
        @case ('ok') {
          @if (article(); as a) {
            <article>
              <p class="eyebrow">
                <a routerLink="/news">Tin tức</a> ·
                {{ a.type === 'ANNOUNCEMENT' ? 'Thông báo' : (a.category ?? 'Bài viết') }}
                @if (a.publishAt) {
                  · {{ a.publishAt | date: 'dd/MM/yyyy' }}
                }
              </p>
              <h1>{{ a.title }}</h1>
              @if (a.coverUrl) {
                <img class="news-detail__cover" [src]="a.coverUrl" [alt]="a.title" />
              }
              <div class="news-detail__content" [innerHTML]="html()"></div>
              @if (a.tags.length) {
                <ul class="news-detail__tags" aria-label="Thẻ">
                  @for (tag of a.tags; track tag) {
                    <li>#{{ tag }}</li>
                  }
                </ul>
              }
              @if (a.relatedProducts.length) {
                <section>
                  <h2>Sản phẩm liên quan</h2>
                  <ul class="news-detail__related">
                    @for (p of a.relatedProducts; track p.id) {
                      <li><a [routerLink]="['/products', p.slug]">{{ p.name }}</a></li>
                    }
                  </ul>
                </section>
              }
            </article>
          }
        }
      }
    </main>
  `,
  styles: `
    .news-detail article {
      max-width: 760px;
      margin-inline: auto;
    }
    .news-detail__cover {
      width: 100%;
      margin-bottom: var(--space-lg);
      border-radius: var(--radius);
    }
    .news-detail__content {
      line-height: 1.7;
    }
    .news-detail__content :is(img, iframe) {
      max-width: 100%;
    }
    .news-detail__content iframe {
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      border: 0;
    }
    .news-detail__content a,
    .news-detail__related a {
      text-decoration: underline;
    }
    .news-detail .news-detail__tags,
    .news-detail .news-detail__related {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      padding: 0;
      margin-block: var(--space-lg);
      list-style: none;
      color: var(--color-muted);
    }
  `,
})
export class NewsDetailComponent {
  private readonly api = inject(CatalogApiService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly slugs = inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('slug') ?? ''));
  private readonly slug = toSignal(this.slugs, { initialValue: '' });

  protected readonly state = toSignal(
    this.slugs.pipe(
      switchMap((slug) =>
        this.api.getArticle(slug).pipe(
          map((article): State => ({ status: 'ok', article })),
          catchError((err: unknown) =>
            of<State>({
              status: err instanceof HttpErrorResponse && err.status === 404 ? 'not-found' : 'error',
            }),
          ),
          startWith<State>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as State },
  );

  protected readonly article = computed(() => {
    const s = this.state();
    return s.status === 'ok' ? s.article : null;
  });

  /**
   * `content` đã qua `sanitizeArticleHtml` ở server (lúc lưu và lúc trả cho khách): chỉ thẻ định dạng
   * và iframe YouTube /embed/. Bộ lọc của Angular sẽ xóa iframe nên chỉ bỏ qua nó cho riêng trường này.
   */
  protected readonly html = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.article()?.content ?? ''),
  );

  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    effect(() => {
      const a = this.article();
      if (!a) return;
      // Slug cũ (server đã 301 sang slug mới): đổi URL, không thêm mục lịch sử.
      if (a.slug !== this.slug()) {
        void this.router.navigate(['/news', a.slug], { replaceUrl: true });
        return;
      }
      title.setTitle(`${a.seoTitle || a.title} | CaraVeso`);
      if (a.metaDescription) meta.updateTag({ name: 'description', content: a.metaDescription });
    });
  }
}
