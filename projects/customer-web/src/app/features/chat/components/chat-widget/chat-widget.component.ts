import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ChatMessageView, ChatSenderType } from 'shared';
import { ChatSenderType as Sender } from 'shared';
import { ChatUiService } from '../../../../core/chat/chat-ui.service';
import { ChatService } from '../../chat.service';

/** Khung chat CSKH: mở từ icon bên phải, bắt buộc đăng nhập và lưu lịch sử trong DB. */
@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent {
  protected readonly chat = inject(ChatService);
  protected readonly ui = inject(ChatUiService);

  protected readonly draft = signal('');

  private readonly scrollRef = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly headerLabel = computed(() => {
    const session = this.chat.session();
    if (!session) return 'Chăm sóc khách hàng';
    if (session.status === 'CLOSED') return 'Cuộc trò chuyện đã kết thúc';
    if (session.status === 'WAITING') return 'Đang kết nối nhân viên';
    if (session.status === 'IN_PROGRESS') return 'Nhân viên CSKH';
    return 'Chăm sóc khách hàng';
  });

  protected readonly headerHint = computed(() => {
    const session = this.chat.session();
    if (!session) return 'Gửi tin nhắn, nhân viên sẽ phản hồi';
    if (session.status === 'CLOSED') return 'Cảm ơn anh/chị đã liên hệ';
    if (session.status === 'WAITING') return 'Tin nhắn đã được gửi tới bộ phận CSKH';
    if (session.status === 'IN_PROGRESS') return 'Nhân viên đang hỗ trợ anh/chị';
    return 'Gửi tin nhắn, nhân viên sẽ phản hồi';
  });

  protected readonly canSend = computed(() => !this.chat.isClosed() && !this.chat.sending());

  constructor() {
    // Chỉ phụ thuộc `supportOpen`; mọi đọc/ghi signal bên trong phải untracked,
    // nếu không `open()` (đọc `_loading`) sẽ làm effect tự chạy lại vô hạn.
    effect(() => {
      const open = this.ui.supportOpen();

      untracked(() => {
        if (!open) {
          this.chat.notifyTyping(false);
          return;
        }

        void this.chat.open().then(() => {
          this.scrollToBottom();
          queueMicrotask(() => this.inputRef()?.nativeElement.focus());
        });
      });
    });

    effect(() => {
      const messages = this.chat.messages();
      const open = this.ui.supportOpen();
      untracked(() => {
        if (messages.length > 0 && open) {
          this.scrollToBottom();
        }
      });
    });

    effect(() => {
      const open = this.ui.supportOpen();
      const unread = this.chat.unread();
      untracked(() => {
        if (open && unread > 0) {
          void this.chat.markRead();
        }
      });
    });
  }

  protected close(): void {
    this.ui.closeSupport();
  }

  protected onDraftInput(value: string): void {
    this.draft.set(value);
    this.chat.notifyTyping(true);

    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    this.typingTimer = setTimeout(() => this.chat.notifyTyping(false), 1200);
  }

  protected onInput(event: Event): void {
    this.onDraftInput((event.target as HTMLTextAreaElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  protected async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || !this.canSend()) return;

    const sent = await this.chat.send(text);
    if (sent) {
      this.draft.set('');
      this.chat.notifyTyping(false);
      this.scrollToBottom();
    }
  }

  protected restart(): void {
    void this.chat.open().then(() => this.scrollToBottom());
  }

  protected isMine(message: ChatMessageView): boolean {
    return message.senderType === Sender.CUSTOMER;
  }

  protected isSystem(message: ChatMessageView): boolean {
    return message.senderType === Sender.SYSTEM;
  }

  protected avatarLabel(sender: ChatSenderType): string {
    if (sender === Sender.AI) return 'AI';
    if (sender === Sender.AGENT) return 'CS';
    return 'KH';
  }

  protected formatTime(sentAt: string): string {
    const date = new Date(sentAt);
    return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const element = this.scrollRef()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
