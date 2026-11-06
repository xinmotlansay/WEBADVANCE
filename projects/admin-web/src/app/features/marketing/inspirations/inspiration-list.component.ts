import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { InspirationApi, STATUS_BADGE, STATUS_LABEL, type InspirationRow } from './inspiration.api';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: InspirationRow[] };

/** MA-08: lưới ảnh cảm hứng, lọc, ẩn/hiện, xóa, đổi thứ tự hiển thị cho khách. */
@Component({
  selector: 'app-inspiration-list',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="cv-main">
      <header class="cv-page-head">
        <h1>Nguồn cảm hứng</h1>
        <div class="tile__btns">
          <a class="cv-btn" routerLink="/marketing/collection">Collection</a>
          <a class="cv-btn cv-btn--primary" routerLink="tao-moi">Thêm ảnh cảm hứng</a>
        </div>
      </header>

      <div class="cv-field filter">
        <label for="f-status">Trạng thái</label>
        <select id="f-status" class="cv-input" [(ngModel)]="status" (ngModelChange)="reload()">
          <option value="">Tất cả</option>
          @for (s of STATUSES; track s[0]) {
            <option [value]="s[0]">{{ s[1] }}</option>
          }
        </select>
      </div>

      @if (error()) {
        <p class="cv-alert" role="alert">{{ error() }}</p>
      }

      @switch (load().state) {
        @case ('loading') {
          <div class="grid" aria-busy="true" aria-label="Đang tải">
            @for (i of [1, 2, 3, 4]; track i) {
              <span class="cv-skeleton sk"></span>
            }
          </div>
        }
        @case ('error') {
          <div class="cv-alert" role="alert">
            <span>{{ $any(load()).message }}</span>
            <button type="button" class="cv-btn" (click)="reload()">Thử lại</button>
          </div>
        }
        @default {
          @let rows = $any(load()).rows;
          @if (rows.length === 0) {
            <div class="cv-empty">
              @if (status) {
                <p>Không có ảnh ở trạng thái này.</p>
                <button type="button" class="cv-btn" (click)="status = ''; reload()">Xóa bộ lọc</button>
              } @else {
                <strong>Chưa có ảnh cảm hứng nào</strong>
                <p>Bấm "Thêm ảnh cảm hứng" ở góc trên để tạo ảnh đầu tiên.</p>
              }
            </div>
          } @else {
            @if (!status) {
              <p class="cv-muted">Thứ tự trong lưới là thứ tự khách thấy ở trang Nguồn cảm hứng và trang chủ.</p>
            }
            <ul class="grid">
              @for (r of rows; track r.id; let i = $index, first = $first, last = $last) {
                <li class="tile cv-card">
                  <img class="tile__img" [src]="r.imageUrl" [alt]="'Ảnh cảm hứng ' + (i + 1)" loading="lazy" />
                  <div class="tile__meta">
                    <span class="cv-badge" [class]="STATUS_BADGE[r.status]">{{ STATUS_LABEL[r.status] }}</span>
                    <span>{{ r.productCount }} sản phẩm</span>
                  </div>
                  @if (r.flags.includes('INACTIVE_PRODUCT')) {
                    <span class="cv-badge cv-badge--danger">Có sản phẩm ngừng bán</span>
                  }
                  <div class="tile__btns">
                    <button
                      type="button"
                      class="cv-btn cv-btn--icon"
                      [attr.aria-label]="'Đưa ảnh ' + (i + 1) + ' lên trước'"
                      [disabled]="first || !!status || busy()"
                      (click)="move(rows, i, -1)"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      class="cv-btn cv-btn--icon"
                      [attr.aria-label]="'Đưa ảnh ' + (i + 1) + ' ra sau'"
                      [disabled]="last || !!status || busy()"
                      (click)="move(rows, i, 1)"
                    >
                      →
                    </button>
                    <a class="cv-btn" [routerLink]="[r.id, 'sua']">Sửa</a>
                    <button type="button" class="cv-btn" [disabled]="busy()" (click)="toggleHidden(r)">
                      {{ r.status === 'VISIBLE' ? 'Ẩn' : 'Hiển thị' }}
                    </button>
                    @if (r.status === 'HIDDEN') {
                      <button type="button" class="cv-btn cv-btn--danger" [disabled]="busy()" (click)="remove(r)">Xóa</button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .filter { max-width: 220px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sk { display: block; height: 240px; }
    .tile { display: flex; flex-direction: column; gap: 8px; }
    .tile__img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--cv-radius); }
    .tile__meta { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .tile__btns { display: flex; flex-wrap: wrap; gap: 6px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspirationListComponent {
  private readonly api = inject(InspirationApi);

  protected readonly STATUSES = Object.entries(STATUS_LABEL);
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_BADGE = STATUS_BADGE;

  protected status = '';
  protected readonly load = signal<Load>({ state: 'loading' });
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.load.set({ state: 'loading' });
    try {
      this.load.set({ state: 'ready', rows: await firstValueFrom(this.api.list(this.status)) });
    } catch (e) {
      this.load.set({ state: 'error', message: parseApiError(e).message });
    }
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

  protected toggleHidden(r: InspirationRow): void {
    const hide = r.status === 'VISIBLE';
    if (hide && !confirm('Ẩn ảnh này? Khách sẽ không còn thấy nó.')) return;
    void this.run(() => firstValueFrom(this.api.setHidden(r.id, hide)));
  }

  protected remove(r: InspirationRow): void {
    if (!confirm('Xóa vĩnh viễn ảnh cảm hứng này? Thao tác này không hoàn tác được.')) return;
    void this.run(() => firstValueFrom(this.api.remove(r.id)));
  }

  protected move(rows: InspirationRow[], index: number, delta: -1 | 1): void {
    const ids = rows.map((r) => r.id);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void this.run(() => firstValueFrom(this.api.reorder(ids)));
  }
}
