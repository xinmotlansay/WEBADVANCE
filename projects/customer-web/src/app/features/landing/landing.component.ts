import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogApiService, type LandingPage } from 'shared';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ContentBlocksComponent } from '../../shared/ui/content-blocks/content-blocks.component';

type State =
  | { status: 'loading' }
  | { status: 'ok'; page: LandingPage }
  | { status: 'not-found' }
  | { status: 'error' };

/** Landing page `/lp/:slug` do Marketing soạn (cùng cấu trúc khối với trang chủ). */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, ContentBlocksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="feature-page container">
      @switch (state().status) {
        @case ('loading') {
          <p class="state" aria-live="polite">Đang tải…</p>
        }
        @case ('not-found') {
          <section class="state">
            <h1>Không tìm thấy trang</h1>
            <p>Trang này không tồn tại hoặc chương trình đã kết thúc.</p>
            <a class="button" routerLink="/">Về trang chủ</a>
          </section>
        }
        @case ('error') {
          <section class="state">
            <h1>Không tải được trang</h1>
            <p>Vui lòng thử lại sau ít phút.</p>
            <a class="button" routerLink="/">Về trang chủ</a>
          </section>
        }
        @case ('ok') {
          @if (page(); as p) {
            <h1>{{ p.name }}</h1>
            <app-content-blocks [blocks]="p.blocks" />
          }
        }
      }
    </main>
  `,
})
export class LandingComponent {
  private readonly api = inject(CatalogApiService);

  protected readonly state = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((p) => p.get('slug') ?? ''),
      switchMap((slug) =>
        this.api.getLandingPage(slug).pipe(
          map((page): State => ({ status: 'ok', page })),
          catchError((err: unknown) =>
            of<State>({ status: err instanceof HttpErrorResponse && err.status === 404 ? 'not-found' : 'error' }),
          ),
          startWith<State>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as State },
  );

  protected page(): LandingPage | null {
    const s = this.state();
    return s.status === 'ok' ? s.page : null;
  }

  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    effect(() => {
      const page = this.page();
      if (!page) return;
      title.setTitle(`${page.seoTitle || page.name} | CaraVeso`);
      if (page.metaDescription) meta.updateTag({ name: 'description', content: page.metaDescription });
    });
  }
}
