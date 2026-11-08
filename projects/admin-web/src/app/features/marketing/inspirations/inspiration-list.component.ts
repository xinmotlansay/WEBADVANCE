import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { parseApiError } from '../../../core/auth/auth-error';
import { ScheduleApi } from '../../../services/marketing/schedule.service';
import { PublishDialogComponent, type PublishChoice } from '../shared/publish-dialog.component';
import { InspirationApi, STATUS_BADGE, STATUS_LABEL, type InspirationRow } from '../../../services/marketing/inspiration.service';

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: InspirationRow[] };

/** MA-08: lưới ảnh cảm hứng, lọc, ẩn/hiện, xóa, đổi thứ tự hiển thị cho khách. */
@Component({
  selector: 'app-inspiration-list',
  imports: [FormsModule, RouterLink, DatePipe, PublishDialogComponent],
  template: `
    <main class="cv-main">
      <header class="cv-page-head">
        <h1>Nguồn cảm hứng</h1>
        <div class="row-btns">
          <a class="cv-btn" routerLink="/marketing/collection">Collection</a>
          <a class="cv-btn cv-btn--primary" routerLink="tao-moi">+ Thêm ảnh cảm hứng</a>
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
          <div aria-busy="true" aria-label="Đang tải">
            @for (i of [1, 2, 3]; track i) {
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
              <p class="cv-muted">Bấm vào ảnh để chỉnh sửa. Kéo thả hàng hoặc dùng ↑ ↓ để đổi thứ tự; thứ tự trong bảng là thứ tự hiển thị trên trang chủ.</p>
            }
            <div class="cv-table-wrap">
              <table class="cv-table">
                <thead>
                  <tr>
                    <th scope="col">Ảnh</th>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thứ tự</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rows; track r.id; let i = $index, first = $first, last = $last) {
                    <tr
                      class="row"
                      [class.row--off]="r.status === 'HIDDEN'"
                      [class.row--drag]="dragId() === r.id"
                      [class.row--over]="overId() === r.id && dragId() !== r.id"
                      [attr.draggable]="status || busy() ? null : 'true'"
                      (dragstart)="dragStart($event, r)"
                      (dragover)="dragOver($event, r)"
                      (dragleave)="overId.set(null)"
                      (drop)="drop($event, rows, r)"
                      (dragend)="dragEnd()"
                      (click)="openRow($event, r)"
                    >
                      <td>
                        <a [routerLink]="[r.id, 'sua']" [attr.aria-label]="'Chỉnh sửa ảnh cảm hứng ' + (i + 1)" draggable="false">
                          <img class="thumb" [src]="r.imageUrl" alt="" loading="lazy" draggable="false" />
                        </a>
                      </td>
                      <td>
                        <a class="row__link" [routerLink]="[r.id, 'sua']" draggable="false">
                          <strong>{{ r.productCount }} sản phẩm</strong>
                        </a>
                        @if (r.flags.includes('INACTIVE_PRODUCT')) {
                          <div><span class="cv-badge cv-badge--danger">Có sản phẩm ngừng bán</span></div>
                        }
                      </td>
                      <td>
                        @if (r.scheduledAt) {
                          <span class="cv-badge cv-badge--info">Hẹn đăng {{ r.scheduledAt | date: 'dd/MM HH:mm' }}</span>
                        } @else {
                          <span class="cv-badge" [class]="STATUS_BADGE[r.status]">{{ STATUS_LABEL[r.status] }}</span>
                        }
                      </td>
                      <td>
                        <div class="row-btns">
                          <span class="grip" aria-hidden="true" title="Kéo để đổi thứ tự">⋮⋮</span>
                          <button
                            type="button"
                            class="cv-btn cv-btn--icon"
                            [attr.aria-label]="'Đưa ảnh ' + (i + 1) + ' lên trên'"
                            [disabled]="first || !!status || busy()"
                            (click)="move(rows, i, -1)"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            class="cv-btn cv-btn--icon"
                            [attr.aria-label]="'Đưa ảnh ' + (i + 1) + ' xuống dưới'"
                            [disabled]="last || !!status || busy()"
                            (click)="move(rows, i, 1)"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <div class="row-btns">
                          @if (r.scheduledAt) {
  <button type="button" class="cv-btn" [disabled]="busy()" (click)="openPublish(r, true)">Đổi giờ</button>
  <button type="button" class="cv-btn" [disabled]="busy()" (click)="cancelSchedule(r)">Hủy lịch</button>
} @else if (r.status === 'HIDDEN') {
  <button type="button" class="cv-btn cv-btn--primary" [disabled]="busy()" (click)="openPublish(r, false)">Đăng…</button>
} @else {
  <button type="button" class="cv-btn" [disabled]="busy()" (click)="toggleHidden(r)">Ẩn</button>
}
                          @if (r.status === 'HIDDEN') {
                            <button type="button" class="cv-btn cv-btn--danger" [disabled]="busy()" (click)="remove(r)">Xóa</button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
      @if (publishing(); as target) {
        <app-publish-dialog
          [subject]="{ kind: 'Nguồn cảm hứng', name: 'Ảnh cảm hứng · ' + target.row.productCount + ' sản phẩm', thumbnail: target.row.imageUrl }"
          [rescheduleOnly]="target.reschedule"
          [busy]="busy()"
          [serverError]="error()"
          (confirmed)="confirmPublish($event)"
          (cancelled)="publishing.set(null)"
        />
      }
    </main>
  `,
  styles: `
    :host { display: block; }
    .row-btns { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .filter { max-width: 220px; margin-bottom: 12px; }
    .sk { display: block; height: 56px; margin-bottom: 8px; }
    .thumb { display: block; width: 48px; aspect-ratio: 2 / 3; object-fit: cover; border-radius: var(--cv-radius); }
    .row { cursor: pointer; }
    .row:hover { background: var(--cv-surface-alt); }
    .row[draggable='true'] { cursor: pointer; }
    .row--off .thumb { opacity: 0.5; }
    .row--drag { opacity: 0.4; }
    .row--over { outline: 2px solid var(--cv-navy); outline-offset: -2px; }
    .row__link { color: inherit; text-decoration: none; }
    .row__link:hover { text-decoration: underline; }
    .grip { color: var(--cv-muted, #888); letter-spacing: -2px; cursor: grab; user-select: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspirationListComponent {
  private readonly api = inject(InspirationApi);
  private readonly schedule = inject(ScheduleApi);
  protected readonly publishing = signal<{ row: InspirationRow; reschedule: boolean } | null>(null);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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

  /** `silent`: tải lại dữ liệu ngầm, không hiện khung chờ nên danh sách không bị nháy. */
  protected async reload(silent = false): Promise<void> {
    if (!silent) this.load.set({ state: 'loading' });
    try {
      this.load.set({ state: 'ready', rows: await firstValueFrom(this.api.list(this.status)) });
    } catch (e) {
      if (silent) this.error.set(parseApiError(e).message);
      else this.load.set({ state: 'error', message: parseApiError(e).message });
    }
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await fn();
      await this.reload(true);
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

  protected openPublish(row: InspirationRow, reschedule: boolean): void {
    this.error.set('');
    this.publishing.set({ row, reschedule });
  }

  protected async confirmPublish(choice: PublishChoice): Promise<void> {
    const target = this.publishing();
    if (!target) return;
    await this.run(() =>
      target.reschedule && choice.publishAt
        ? firstValueFrom(this.schedule.reschedule('INSPIRATION', target.row.id, choice.publishAt))
        : firstValueFrom(this.api.setHidden(target.row.id, false, choice.publishAt)),
    );
    if (!this.error()) this.publishing.set(null);
  }

  protected cancelSchedule(r: InspirationRow): void {
    if (!confirm('Hủy lịch đăng ảnh này? Ảnh sẽ quay về trạng thái ẩn.')) return;
    void this.run(() => firstValueFrom(this.schedule.cancel('INSPIRATION', r.id)));
  }

  protected remove(r: InspirationRow): void {
    if (!confirm('Xóa vĩnh viễn ảnh cảm hứng này? Thao tác này không hoàn tác được.')) return;
    void this.run(() => firstValueFrom(this.api.remove(r.id)));
  }

  protected move(rows: InspirationRow[], index: number, delta: -1 | 1): void {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    this.load.set({ state: 'ready', rows: next });
    void this.run(() => firstValueFrom(this.api.reorder(next.map((r) => r.id))));
  }

  /** Bấm vào đâu trên hàng cũng mở trang chi tiết, trừ nút và liên kết có việc riêng. */
  protected openRow(e: MouseEvent, r: InspirationRow): void {
    if ((e.target as HTMLElement).closest('button, a')) return;
    void this.router.navigate([r.id, 'sua'], { relativeTo: this.route });
  }

  protected readonly dragId = signal<string | null>(null);
  protected readonly overId = signal<string | null>(null);

  protected dragStart(e: DragEvent, r: InspirationRow): void {
    if (this.status || this.busy()) return e.preventDefault();
    this.dragId.set(r.id);
    e.dataTransfer?.setData('text/plain', r.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected dragOver(e: DragEvent, r: InspirationRow): void {
    if (!this.dragId()) return;
    e.preventDefault();
    this.overId.set(r.id);
  }

  protected dragEnd(): void {
    this.dragId.set(null);
    this.overId.set(null);
  }

  /** Thả ảnh vào vị trí của ảnh đích: cập nhật ngay trên màn hình rồi lưu thứ tự. */
  protected drop(e: DragEvent, rows: InspirationRow[], target: InspirationRow): void {
    e.preventDefault();
    const from = rows.findIndex((r) => r.id === this.dragId());
    const to = rows.findIndex((r) => r.id === target.id);
    this.dragEnd();
    if (from < 0 || to < 0 || from === to) return;
    const next = [...rows];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    this.load.set({ state: 'ready', rows: next });
    void this.run(() => firstValueFrom(this.api.reorder(next.map((r) => r.id))));
  }
}
