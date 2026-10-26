import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ChatUiService } from '../../core/chat/chat-ui.service';
import { SearchUiService } from '../../core/search/search-ui.service';
import { ChatService } from '../../features/chat/chat.service';
import { IconComponent } from '../../shared/ui/icons/icon.component';

/** Cuộn quá ngưỡng này (px) thì hiện nút về đầu trang. */
const SHOW_TOP_THRESHOLD = 400;

/** Nút nổi: tìm kiếm và AI giữa chân trang, chat CSKH và về đầu trang ở góc phải. */
@Component({
  selector: 'app-floating-actions',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:scroll)': 'onScroll()' },
  templateUrl: './floating-actions.component.html',
  styleUrl: './floating-actions.component.css',
})
export class FloatingActionsComponent {
  private readonly search = inject(SearchUiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly chat = inject(ChatService);
  private readonly chatUi = inject(ChatUiService);

  protected readonly showTop = signal(false);
  protected readonly unread = this.chat.unread;
  protected readonly aiOpen = this.chatUi.aiOpen;
  protected readonly supportOpen = this.chatUi.supportOpen;

  protected onScroll(): void {
    this.showTop.set(window.scrollY > SHOW_TOP_THRESHOLD);
  }

  protected openSearch(): void {
    this.search.openSearch();
  }

  /** Trợ lý AI công khai: không cần đăng nhập, không lưu DB. */
  protected openAi(): void {
    this.chatUi.toggleAi();
  }

  /** Chat CSKH: bắt buộc đăng nhập mới mở được khung chat. */
  protected openSupport(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login']);
      return;
    }
    this.chatUi.toggleSupport();
  }

  protected scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
