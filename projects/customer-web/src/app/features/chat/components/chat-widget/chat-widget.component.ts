import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { ChatMessageView, ChatSenderType } from 'shared';
import { ChatSenderType as Sender } from 'shared';
import { ChatService } from '../../chat.service';

const QUICK_PROMPTS = [
  'Chính sách bảo hành thế nào?',
  'Đổi trả trong bao lâu?',
  'Phí giao hàng tính ra sao?',
];

@Component({
  selector: 'app-chat-widget',
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent {
  protected readonly chat = inject(ChatService);
  protected readonly quickPrompts = QUICK_PROMPTS;

  protected readonly open = signal(false);
  protected readonly draft = signal('');

  private readonly scrollRef = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly headerLabel = computed(() => {
    const session = this.chat.session();
    if (!session) return 'Trợ lý CaraVeso';
    if (session.status === 'CLOSED') return 'Cuộc trò chuyện đã kết thúc';
    if (session.mode === 'SUPPORT') {
      return session.status === 'WAITING' ? 'Đang chờ nhân viên CSKH' : 'Nhân viên CSKH';
    }
    return 'Trợ lý AI CaraVeso';
  });

  protected readonly headerHint = computed(() => {
    const session = this.chat.session();
    if (!session) return 'Tư vấn sản phẩm và chính sách';
    if (session.status === 'CLOSED') return 'Cảm ơn anh/chị đã liên hệ';
    if (session.mode === 'SUPPORT') {
      return session.status === 'WAITING'
        ? 'Tin nhắn đã được gửi tới bộ phận CSKH'
        : 'Nhân viên đang hỗ trợ anh/chị';
    }
    return 'Trả lời tự động 24/7';
  });

  protected readonly canSend = computed(() => !this.chat.isClosed() && !this.chat.sending());

  constructor() {
    effect(() => {
      const messages = this.chat.messages();
      if (messages.length > 0 && this.open()) {
        this.scrollToBottom();
      }
    });

    effect(() => {
      if (this.open() && !this.chat.loading()) {
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });

    effect(() => {
      if (this.open() && this.chat.unread() > 0) {
        void this.chat.markRead();
      }
    });
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);

    if (next) {
      void this.chat.open().then(() => this.scrollToBottom());
    } else {
      this.chat.notifyTyping(false);
    }
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

  protected sendQuick(prompt: string): void {
    if (this.chat.sending()) return;
    void this.chat.send(prompt).then(() => this.scrollToBottom());
  }

  protected async requestAgent(): Promise<void> {
    await this.chat.requestAgent();
    this.scrollToBottom();
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
