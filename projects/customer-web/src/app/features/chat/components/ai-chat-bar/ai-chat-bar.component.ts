import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApiResponse,
  ChatAiAskRequest,
  ChatAiAskResponse,
  ChatAiHistoryItem,
  ChatAiProductSuggestion,
} from 'shared';
import { ChatUiService } from '../../../../core/chat/chat-ui.service';
import { SearchUiService } from '../../../../core/search/search-ui.service';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { AiProductCardComponent } from '../ai-product-card/ai-product-card.component';
import {
  MAX_STORED_SESSIONS,
  readChatSessions,
  sessionTitle,
  writeChatSessions,
  type StoredChatSession,
} from './ai-chat-history';

const API_BASE = '/api/v1/chat';

const GREETING =
  'Dạ, em là trợ lý AI của CaraVeso. Em có thể tư vấn sản phẩm nội thất, bảo hành, đổi trả, giao hàng và thanh toán. Anh/chị cần em hỗ trợ gì ạ?';

const GREETING_ID = 1;

const DEFAULT_SUGGESTIONS = [
  'Sofa da phù hợp phòng 20m²?',
  'Chính sách đổi trả thế nào?',
  'Phí giao hàng tính ra sao?',
];

interface AiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  products?: ChatAiProductSuggestion[];
}

interface FailedRequest {
  text: string;
  history: ChatAiHistoryItem[];
}

/**
 * Cụm Search + trợ lý AI đặt cố định trên trang chủ (ngay trên "Sản phẩm mới").
 * Bấm AI: hai nút thu về thanh nhập; bấm ra ngoài: quay lại hai nút ban đầu.
 * Hội thoại được lưu tạm trong localStorage để mở lại lịch sử phiên chat.
 */
@Component({
  selector: 'app-ai-chat-bar',
  imports: [IconComponent, AiProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-chat-bar.component.html',
  styleUrl: './ai-chat-bar.component.scss',
})
export class AiChatBarComponent {
  private readonly http = inject(HttpClient);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly searchUi = inject(SearchUiService);
  protected readonly ui = inject(ChatUiService);

  protected readonly messages = signal<AiMessage[]>([
    { id: GREETING_ID, role: 'assistant', content: GREETING },
  ]);
  protected readonly suggestions = signal<string[]>(DEFAULT_SUGGESTIONS);
  protected readonly draft = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sessions = signal<StoredChatSession[]>([]);
  protected readonly activeSessionId = signal<string>(newSessionId());
  protected readonly historyOpen = signal(false);
  protected readonly lastFailed = signal<FailedRequest | null>(null);
  /** Đã tương tác ít nhất một lần: giữ khung chat mở kể cả khi mới chỉ có lời chào. */
  private readonly started = signal(false);

  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.loading());
  protected readonly canRetry = computed(() => this.lastFailed() !== null && !this.loading());
  protected readonly showPanel = computed(
    () =>
      this.messages().length > 1 ||
      this.loading() ||
      this.error() !== null ||
      this.historyOpen() ||
      this.started(),
  );

  private readonly scrollRef = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private nextId = GREETING_ID + 1;

  constructor() {
    const stored = readChatSessions();
    this.sessions.set(stored);
    const latest = stored[0];
    if (latest) {
      this.loadSession(latest);
    }

    effect(() => {
      if (!this.ui.aiOpen()) return;
      this.messages();
      this.loading();
      queueMicrotask(() => {
        this.scrollToBottom();
        this.inputRef()?.nativeElement.focus();
      });
    });
  }

  /**
   * Đóng khi bấm ra ngoài. Dùng `composedPath()` thay vì `contains(event.target)`:
   * cú click mở khung khiến view render lại ngay, nên target đã bị gỡ khỏi DOM
   * trước khi sự kiện nổi bọt tới document.
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.ui.aiOpen()) return;
    if (event.composedPath().includes(this.host.nativeElement)) return;
    this.historyOpen.set(false);
    this.ui.closeAi();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.ui.aiOpen()) return;
    if (this.historyOpen()) {
      this.historyOpen.set(false);
      return;
    }
    this.ui.closeAi();
  }

  protected openSearch(): void {
    this.searchUi.openSearch();
  }

  protected openAi(): void {
    this.ui.toggleAi();
  }

  protected close(): void {
    this.historyOpen.set(false);
    this.ui.closeAi();
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  protected sendSuggestion(prompt: string): void {
    void this.send(prompt);
  }

  protected async send(override?: string): Promise<void> {
    const text = (override ?? this.draft()).trim();
    if (!text || this.loading()) return;

    const history = this.messages()
      .filter((message) => message.id !== GREETING_ID)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    this.messages.update((messages) => [
      ...messages,
      { id: this.nextId++, role: 'user', content: text },
    ]);
    this.draft.set('');
    this.started.set(true);
    this.historyOpen.set(false);

    await this.request(text, history);
  }

  /** Gửi lại đúng câu hỏi vừa lỗi, không thêm lại bong bóng của khách. */
  protected async retry(): Promise<void> {
    const failed = this.lastFailed();
    if (!failed || this.loading()) return;
    await this.request(failed.text, failed.history);
  }

  protected toggleHistory(): void {
    this.historyOpen.update((open) => !open);
  }

  protected selectSession(id: string): void {
    const session = this.sessions().find((item) => item.id === id);
    if (!session) return;

    this.loadSession(session);
    this.historyOpen.set(false);
    this.error.set(null);
    this.lastFailed.set(null);
    queueMicrotask(() => this.scrollToBottom());
  }

  protected startNewSession(): void {
    this.activeSessionId.set(newSessionId());
    this.messages.set([{ id: GREETING_ID, role: 'assistant', content: GREETING }]);
    this.nextId = GREETING_ID + 1;
    this.suggestions.set(DEFAULT_SUGGESTIONS);
    this.draft.set('');
    this.error.set(null);
    this.lastFailed.set(null);
    this.started.set(true);
    this.historyOpen.set(false);
    queueMicrotask(() => this.inputRef()?.nativeElement.focus());
  }

  protected removeSession(id: string, event: Event): void {
    event.stopPropagation();

    const next = this.sessions().filter((session) => session.id !== id);
    this.sessions.set(next);
    writeChatSessions(next);

    if (this.activeSessionId() === id) {
      this.startNewSession();
      this.historyOpen.set(true);
    }
  }

  /** Nhãn thời gian tương đối cho danh sách phiên chat. */
  protected relativeTime(timestamp: number): string {
    const minutes = Math.floor((Date.now() - timestamp) / 60_000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN');
  }

  private async request(text: string, history: ChatAiHistoryItem[]): Promise<void> {
    this.error.set(null);
    this.lastFailed.set(null);
    this.loading.set(true);
    this.scrollToBottom();

    try {
      const body: ChatAiAskRequest = { message: text, history };
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ChatAiAskResponse>>(`${API_BASE}/ai/ask`, body),
      );

      this.messages.update((messages) => [
        ...messages,
        {
          id: this.nextId++,
          role: 'assistant',
          content: response.data.reply,
          products: response.data.products,
        },
      ]);
      if (response.data.suggestions.length > 0) {
        this.suggestions.set(response.data.suggestions);
      }
      this.persist();
    } catch (error) {
      this.error.set(toMessage(error));
      this.lastFailed.set({ text, history });
    } finally {
      this.loading.set(false);
      this.scrollToBottom();
    }
  }

  private loadSession(session: StoredChatSession): void {
    this.activeSessionId.set(session.id);
    this.messages.set([
      { id: GREETING_ID, role: 'assistant', content: GREETING },
      ...session.messages.map((message) => ({
        id: this.nextId++,
        role: message.role,
        content: message.content,
        products: message.products,
      })),
    ]);
  }

  /** Lưu phiên hiện tại vào localStorage (bỏ qua khi chưa có câu hỏi nào). */
  private persist(): void {
    const history = this.messages()
      .filter((message) => message.id !== GREETING_ID)
      .map(({ role, content, products }) =>
        products?.length ? { role, content, products } : { role, content },
      );
    const firstQuestion = history.find((message) => message.role === 'user');
    if (!firstQuestion) return;

    const session: StoredChatSession = {
      id: this.activeSessionId(),
      title: sessionTitle(firstQuestion.content),
      updatedAt: Date.now(),
      messages: history,
    };

    const next = [session, ...this.sessions().filter((item) => item.id !== session.id)].slice(
      0,
      MAX_STORED_SESSIONS,
    );

    this.sessions.set(next);
    writeChatSessions(next);
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

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function toMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string } } | null;
    return body?.error?.message ?? 'Không kết nối được trợ lý, anh/chị thử lại sau nhé.';
  }
  return 'Có lỗi xảy ra, anh/chị thử lại sau nhé.';
}
