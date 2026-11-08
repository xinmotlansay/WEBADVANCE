import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SearchUiService } from '../../services/search/search-ui.service';
import { AuthService } from '../../services/auth/auth.service';
import { ChatUiService } from '../../services/chat/chat-ui.service';
import { ChatService } from '../../services/chat/chat.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

/** Cuộn quá ngưỡng này (px) thì hiện nút về đầu trang. */
const SHOW_TOP_THRESHOLD = 400;

/** Nút nổi: Search và AI ở giữa chân trang, chat CSKH và về đầu trang ở góc phải. */
@Component({
  selector: 'app-floating-actions',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:scroll)': 'onScroll()' },
  templateUrl: './floating-actions.component.html',
  styleUrl: './floating-actions.component.css',
})
export class FloatingActionsComponent {
  /** Hiện cụm nút Search và AI ở giữa chân trang. */
  readonly showDock = input(true);

  private readonly search = inject(SearchUiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly chat = inject(ChatService);
  private readonly chatUi = inject(ChatUiService);

  protected readonly showTop = signal(false);
  protected readonly unread = this.chat.unread;
  protected readonly supportOpen = this.chatUi.supportOpen;
  protected readonly aiOpen = this.chatUi.aiOpen;

  protected onScroll(): void {
    this.showTop.set(window.scrollY > SHOW_TOP_THRESHOLD);
  }

  /** Chat CSKH: bắt buộc đăng nhập mới mở được khung chat. */
  protected openSupport(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login']);
      return;
    }
    this.chatUi.toggleSupport();
  }

  protected openSearch(): void {
    this.search.openSearch();
  }

  protected toggleAi(): void {
    this.chatUi.toggleAi();
  }

  protected scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
