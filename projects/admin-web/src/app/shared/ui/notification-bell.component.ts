import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from './icon.component';

export interface BellItem {
  key: string;
  title: string;
  detail: string;
}

/** Chuông thông báo: chỉ hiện sự kiện thuộc vai trò đang đăng nhập (admin-ui-rule mục 8). */
@Component({
  selector: 'app-notification-bell',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <button
      type="button"
      class="btn btn-icon"
      [attr.aria-label]="items().length ? 'Thông báo, ' + items().length + ' mục cần xử lý' : 'Thông báo'"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <app-icon name="bell" [small]="true" />
      @if (items().length) {
        <span class="dot-count">{{ items().length }}</span>
      }
    </button>
    @if (open()) {
      <div class="menu" role="region" aria-label="Thông báo">
        <p class="section-label">Cần xử lý</p>
        @for (item of items(); track item.key) {
          <button type="button" class="item" (click)="picked.emit(item.key); open.set(false)">
            <strong>{{ item.title }}</strong>
            <span>{{ item.detail }}</span>
          </button>
        } @empty {
          <p class="empty">Không có việc cần xử lý.</p>
        }
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
      width: 300px;
      padding: 12px;
      border: 1px solid var(--cv-border-strong);
      border-radius: var(--cv-radius-lg);
      background: var(--cv-surface);
      box-shadow: var(--cv-shadow);
    }
    .section-label {
      margin-bottom: 8px;
    }
    .item {
      display: grid;
      gap: 2px;
      width: 100%;
      padding: 8px;
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
    .item strong {
      font-size: 13px;
      font-weight: 600;
    }
    .item span {
      font-size: 12px;
      color: var(--cv-muted);
    }
    .empty {
      margin: 0;
      font-size: 13px;
      color: var(--cv-muted);
    }
  `,
})
export class NotificationBellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly items = input<BellItem[]>([]);
  readonly picked = output<string>();
  protected readonly open = signal(false);

  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
