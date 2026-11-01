import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AdminApiService, type AdminNotification } from '../../core/api/admin-api.service';
import { formatDate, formatTime } from '../format';
import { IconComponent } from './icon.component';

export interface BellItem {
  key: string;
  title: string;
  detail: string;
}

const POLL_MS = 60_000;

/**
 * Chuông thông báo: chỉ hiện sự kiện thuộc vai trò đang đăng nhập (admin-ui-rule mục 8).
 * "Cần xử lý" do trang truyền vào; "Thông báo" là thông báo trong ứng dụng từ máy chủ
 * (cảnh báo tồn kho, đánh giá bị báo cáo, tóm tắt tồn kho hằng ngày).
 */
@Component({
  selector: 'app-notification-bell',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <button
      type="button"
      class="btn btn-icon"
      [attr.aria-label]="count() ? 'Thông báo, ' + count() + ' mục mới' : 'Thông báo'"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <app-icon name="bell" [small]="true" />
      @if (count()) {
        <span class="dot-count">{{ count() > 99 ? '99+' : count() }}</span>
      }
    </button>
    @if (open()) {
      <div class="menu" role="region" aria-label="Thông báo">
        @if (items().length) {
          <p class="section-label">Cần xử lý</p>
          @for (item of items(); track item.key) {
            <button type="button" class="item" (click)="picked.emit(item.key); open.set(false)">
              <strong>{{ item.title }}</strong>
              <span>{{ item.detail }}</span>
            </button>
          }
        }
        <div class="head">
          <p class="section-label">Thông báo</p>
          @if (unread()) {
            <button type="button" class="btn-link" (click)="readAll()">Đánh dấu đã đọc</button>
          }
        </div>
        <div class="list">
          @for (n of notifications(); track n.id) {
            <button type="button" class="item" [class.unread]="!n.read" (click)="go(n)">
              <strong>{{ n.title }}</strong>
              <span>{{ n.detail }}</span>
              <small>{{ when(n.createdAt) }}</small>
            </button>
          } @empty {
            <p class="empty">{{ loadError() ? 'Không tải được thông báo.' : 'Chưa có thông báo nào.' }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }
    .menu {
      position: absolute;
      z-index: 20;
      top: calc(100% + 4px);
      right: 0;
      width: 320px;
      padding: 12px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      box-shadow: var(--cv-shadow);
    }
    .section-label {
      margin-bottom: 8px;
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-top: 8px;
    }
    .list {
      max-height: 360px;
      overflow-y: auto;
    }
    .item {
      position: relative;
      display: grid;
      gap: 2px;
      width: 100%;
      padding: 8px 8px 8px 16px;
      border: 0;
      border-radius: var(--cv-radius);
      background: none;
      color: var(--cv-navy);
      text-align: left;
      cursor: pointer;
    }
    .item:hover {
      background: var(--cv-surface-alt);
    }
    .item.unread::before {
      content: '';
      position: absolute;
      top: 14px;
      left: 4px;
      width: 6px;
      height: 6px;
      border-radius: 2px;
      background: var(--cv-navy);
    }
    .item strong {
      font-size: 13px;
      font-weight: 600;
    }
    .item span,
    .item small {
      font-size: 12px;
      color: var(--cv-muted);
    }
    .empty {
      margin: 0;
      padding: 8px 0;
      font-size: 13px;
      color: var(--cv-muted);
    }
  `,
})
export class NotificationBellComponent implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = input<BellItem[]>([]);
  readonly picked = output<string>();
  protected readonly open = signal(false);
  protected readonly notifications = signal<AdminNotification[]>([]);
  protected readonly unread = signal(0);
  protected readonly loadError = signal(false);
  protected readonly count = computed(() => this.items().length + this.unread());

  ngOnInit(): void {
    this.load();
    const timer = setInterval(() => this.load(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected toggle(): void {
    this.open.set(!this.open());
    if (this.open()) this.load();
  }

  protected go(n: AdminNotification): void {
    this.open.set(false);
    if (!n.read) this.api.markNotificationsRead(n.id).subscribe({ next: () => this.load() });
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  protected readAll(): void {
    this.api.markNotificationsRead().subscribe({ next: () => this.load() });
  }

  protected when(value: string): string {
    return `${formatTime(value)} · ${formatDate(value)}`;
  }

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private load(): void {
    this.api.notifications().subscribe({
      next: ({ data, unread }) => {
        this.loadError.set(false);
        this.notifications.set(data);
        this.unread.set(unread);
      },
      error: () => this.loadError.set(true),
    });
  }
}
