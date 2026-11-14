import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AiChatApiService } from '../../../../services/chat/ai-chat-api.service';
import { AuthService } from '../../../../services/auth/auth.service';
import type {
  ChatAiConversationSummary,
  ChatAiConversationView,
  ChatAiHistoryItem,
  ChatAiProductSuggestion,
} from 'shared';
import { ChatUiService } from '../../../../services/chat/chat-ui.service';
import { IconComponent } from '../../../../shared/ui/icons/icon.component';
import { AiProductCardComponent } from '../ai-product-card/ai-product-card.component';
import {
  GUEST_MAX_ASKS,
  clearChatSessions,
  readGuestAsks,
  writeGuestAsks,
} from './ai-chat-history';

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

interface SessionGroup {
  label: string;
  items: ChatAiConversationSummary[];
}

/**
 * Cụm Search + trợ lý AI đặt cố định trên trang chủ (ngay trên "Sản phẩm mới").
 * Bấm AI: hai nút thu về thanh nhập; bấm ra ngoài: quay lại hai nút ban đầu.
 * Hội thoại được lưu trên server; nút ☰ mở danh sách phiên trượt từ trái để chọn lại.
 */
@Component({
  selector: 'app-ai-chat-bar',
  imports: [IconComponent, AiProductCardComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-chat-bar.component.html',
  styleUrl: './ai-chat-bar.component.scss',
})
export class AiChatBarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly ui = inject(ChatUiService);
  private readonly auth = inject(AuthService);
  private readonly aiChatApi = inject(AiChatApiService);

  protected readonly messages = signal<AiMessage[]>([
    { id: GREETING_ID, role: 'assistant', content: GREETING },
  ]);
  protected readonly suggestions = signal<string[]>(DEFAULT_SUGGESTIONS);
  /** Câu hỏi làm rõ AI đặt ra khi mô tả còn sơ sài (null nếu không có). */
  protected readonly followUpQuestion = signal<string | null>(null);
  protected readonly draft = signal('');
  /** Màn hình hẹp: dùng gợi ý ngắn để chữ không bị ép/xuống dòng trong ô nhập. */
  protected readonly placeholder =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
      ? 'Mô tả sản phẩm bạn cần…'
      : 'Nhập mô tả đơn giản về sản phẩm (VD: bàn ăn 4 ghế, phù hợp với phòng 50m2,...)';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly sessions = signal<ChatAiConversationSummary[]>([]);
  protected readonly activeSessionId = signal<string>(newSessionId());
  /** Mở drawer danh sách cuộc trò chuyện (trượt từ trái khung chat). */
  protected readonly historyOpen = signal(false);
  /** Phiên đang chờ xác nhận xoá ở bước 2 (bấm xoá lần nữa để xoá thật). */
  protected readonly deleteConfirmId = signal<string | null>(null);
  /** Phiên đang sửa tên tại chỗ. */
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameDraft = signal('');
  protected readonly lastFailed = signal<FailedRequest | null>(null);
  /** Đã gửi câu hỏi trong lần mở này: chỉ khi đó mới hiện khung kết quả bên trên thanh nhập. */
  private readonly started = signal(false);

  /** Phiên chat nhóm theo thời gian như ChatGPT (Hôm nay / Hôm qua / 7 ngày qua / Cũ hơn). */
  protected readonly sessionGroups = computed<SessionGroup[]>(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86_400_000;
    const startOfWeek = startOfToday - 6 * 86_400_000;
    const groups: SessionGroup[] = [
      { label: 'Hôm nay', items: [] },
      { label: 'Hôm qua', items: [] },
      { label: '7 ngày qua', items: [] },
      { label: 'Cũ hơn', items: [] },
    ];

    for (const session of this.sessions()) {
      const time = new Date(session.updatedAt).getTime();
      const index = Number.isNaN(time)
        ? 3
        : time >= startOfToday
          ? 0
          : time >= startOfYesterday
            ? 1
            : time >= startOfWeek
              ? 2
              : 3;
      groups[index]!.items.push(session);
    }

    return groups.filter((group) => group.items.length > 0);
  });

  /** Số câu khách chưa đăng nhập đã hỏi trong phiên trình duyệt này. */
  private readonly guestAsks = signal(readGuestAsks());
  protected readonly guestLimitReached = computed(
    () => !this.auth.isAuthenticated() && this.guestAsks() >= GUEST_MAX_ASKS,
  );
  protected readonly GUEST_MAX_ASKS = GUEST_MAX_ASKS;

  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.loading());
  protected readonly canRetry = computed(() => this.lastFailed() !== null && !this.loading());
  /** Khách chủ động thu gọn hộp hội thoại bằng nút trên thanh nhập. */
  private readonly collapsed = signal(false);
  protected readonly showPanel = computed(
    () =>
      !this.collapsed() &&
      (this.loading() || this.error() !== null || this.historyOpen() || this.started()),
  );

  private readonly scrollRef = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly renameInputRef = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private nextId = GREETING_ID + 1;

  constructor() {
    // Dữ liệu chat cũ của khách từng nằm lâu dài trong localStorage: dọn phần còn sót lại.
    try {
      localStorage.removeItem('caraveso.ai.sessions.v1');
    } catch {
      // Bỏ qua khi trình duyệt chặn localStorage.
    }

    // Lịch sử nằm trên server: tài khoản đăng nhập hoặc cookie khách vãng lai.
    this.loadRemoteSessions();

    let wasSignedIn = this.auth.isAuthenticated();
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      if (signedIn && !wasSignedIn) {
        // Gộp hội thoại khách vãng lai vào tài khoản rồi tải lại lịch sử.
        clearChatSessions();
        this.guestAsks.set(0);
        untracked(() => {
          this.aiChatApi.mergeGuest().subscribe({
            next: () => this.loadRemoteSessions(),
            error: () => this.loadRemoteSessions(),
          });
        });
      } else if (!signedIn && wasSignedIn) {
        // Đăng xuất hoặc hết phiên: xoá hội thoại của tài khoản khỏi màn hình.
        clearChatSessions();
        this.guestAsks.set(0);
        this.sessions.set([]);
        untracked(() => {
          this.startNewSession();
          this.loadRemoteSessions();
        });
        this.started.set(false);
      }
      wasSignedIn = signedIn;
    });

    // Mỗi lần mở lại chỉ hiện thanh nhập; khung kết quả đợi đến khi khách gửi câu hỏi.
    effect(() => {
      if (this.ui.aiOpen()) return;
      this.started.set(false);
      this.historyOpen.set(false);
      this.collapsed.set(false);
    });

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
    const path = event.composedPath();
    if (path.includes(this.host.nativeElement)) return;
    // Nút AI nằm ở cụm nút nổi, ngoài khung này: để chính nút đó tự bật/tắt.
    if (path.some((el) => el instanceof Element && el.classList.contains('dock__ai'))) return;
    this.historyOpen.set(false);
    this.ui.closeAi();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.ui.aiOpen()) return;
    if (this.renamingId()) {
      this.cancelRename();
      return;
    }
    if (this.historyOpen()) {
      this.closeHistory();
      return;
    }
    this.ui.closeAi();
  }

  /** Tin nhắn AI đã bấm "Xem thêm" để hiện đủ thẻ sản phẩm. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());
  protected readonly INITIAL_PRODUCTS = 4;

  protected expand(id: number): void {
    this.expanded.update((set) => new Set(set).add(id));
  }

  protected productIds(products: ChatAiProductSuggestion[]): string {
    return products.map((product) => product.id).join(',');
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

    if (this.guestLimitReached()) {
      // Hết 5 câu của khách: hiện lời mời đăng nhập, giữ nguyên nội dung đang gõ.
      this.collapsed.set(false);
      this.started.set(true);
      this.historyOpen.set(false);
      return;
    }
    if (!this.auth.isAuthenticated()) {
      const count = this.guestAsks() + 1;
      this.guestAsks.set(count);
      writeGuestAsks(count);
    }

    const history = this.messages()
      .filter((message) => message.id !== GREETING_ID)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    this.messages.update((messages) => [
      ...messages,
      { id: this.nextId++, role: 'user', content: text },
    ]);
    this.draft.set('');
    this.collapsed.set(false);
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

  /** Nút trên thanh nhập: mở / thu gọn hộp hội thoại. Chỉ nút này mới mở hộp, bấm vào ô nhập thì không. */
  protected togglePanel(): void {
    if (this.showPanel()) {
      this.collapsed.set(true);
      this.historyOpen.set(false);
      return;
    }
    this.collapsed.set(false);
    this.started.set(true);
  }

  protected toggleHistory(): void {
    if (this.historyOpen()) {
      this.closeHistory();
      return;
    }
    // Mở drawer thì mở luôn khung hội thoại phía sau để có chỗ trượt danh sách ra.
    this.collapsed.set(false);
    this.started.set(true);
    this.deleteConfirmId.set(null);
    this.renamingId.set(null);
    this.historyOpen.set(true);
  }

  protected closeHistory(): void {
    this.historyOpen.set(false);
    this.deleteConfirmId.set(null);
    this.renamingId.set(null);
  }

  protected selectSession(id: string): void {
    this.aiChatApi.conversation(id).subscribe({
      next: (conversation) => {
        this.loadSession(conversation);
        this.collapsed.set(false);
        this.started.set(true);
        this.closeHistory();
        this.error.set(null);
        this.lastFailed.set(null);
        queueMicrotask(() => this.scrollToBottom());
      },
      error: () => {
        this.error.set('Không tải được cuộc trò chuyện, anh/chị thử lại sau nhé.');
      },
    });
  }

  protected startNewSession(): void {
    this.beginNewConversation();
    this.closeHistory();
  }

  /** Đưa khung chat về phiên trống (không đụng tới trạng thái đóng/mở drawer). */
  private beginNewConversation(): void {
    this.activeSessionId.set(newSessionId());
    this.messages.set([{ id: GREETING_ID, role: 'assistant', content: GREETING }]);
    this.nextId = GREETING_ID + 1;
    this.suggestions.set(DEFAULT_SUGGESTIONS);
    this.followUpQuestion.set(null);
    this.draft.set('');
    this.error.set(null);
    this.lastFailed.set(null);
    this.collapsed.set(false);
    this.started.set(true);
    queueMicrotask(() => this.inputRef()?.nativeElement.focus());
  }

  /** Bút chì: sửa tên phiên ngay tại chỗ trong danh sách. */
  protected startRename(session: ChatAiConversationSummary, event: Event): void {
    event.stopPropagation();
    this.deleteConfirmId.set(null);
    this.renamingId.set(session.id);
    this.renameDraft.set(session.title);
    queueMicrotask(() => {
      const input = this.renameInputRef()?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  protected onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  protected saveRename(id: string, event?: Event): void {
    if (event) event.preventDefault();
    // Bỏ qua khi blur phát sinh sau khi đã lưu/huỷ ở lần gọi trước.
    if (this.renamingId() !== id) return;

    const title = this.renameDraft().trim();
    this.renamingId.set(null);
    this.renameDraft.set('');
    if (!title) return;

    this.sessions.update((sessions) =>
      sessions.map((session) => (session.id === id ? { ...session, title } : session)),
    );
    this.aiChatApi.rename(id, title).subscribe({
      next: (summary) =>
        this.sessions.update((sessions) =>
          sessions.map((session) => (session.id === id ? { ...session, ...summary } : session)),
        ),
      error: () => this.loadRemoteSessions(),
    });
  }

  /** Thùng rác: bấm lần đầu chỉ hỏi "Xoá?", bấm lần hai mới xoá thật. */
  protected requestDelete(id: string, event: Event): void {
    event.stopPropagation();
    this.renamingId.set(null);
    this.deleteConfirmId.set(id);
  }

  protected confirmDelete(id: string, event: Event): void {
    event.stopPropagation();
    this.deleteConfirmId.set(null);

    const wasActive = this.activeSessionId() === id;
    this.sessions.update((sessions) => sessions.filter((session) => session.id !== id));
    this.aiChatApi.remove(id).subscribe({ error: () => this.loadRemoteSessions() });

    if (wasActive) this.beginNewConversation();
  }

  /** Nhãn thời gian tương đối cho danh sách phiên chat. */
  protected relativeTime(timestamp: string | number): string {
    const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    if (Number.isNaN(time)) return '';
    const minutes = Math.floor((Date.now() - time) / 60_000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(time).toLocaleDateString('vi-VN');
  }

  private async request(text: string, history: ChatAiHistoryItem[]): Promise<void> {
    this.error.set(null);
    this.lastFailed.set(null);
    this.loading.set(true);
    this.scrollToBottom();

    try {
      const response = await firstValueFrom(
        this.aiChatApi.ask(text, history, this.activeSessionId()),
      );

      this.activeSessionId.set(response.conversationId);
      this.messages.update((messages) => [
        ...messages,
        {
          id: this.nextId++,
          role: 'assistant',
          content: response.reply,
          products: response.products,
        },
      ]);
      if (response.suggestions.length > 0) {
        this.suggestions.set(response.suggestions);
      }
      this.followUpQuestion.set(response.followUp?.question ?? null);
      this.upsertSessionSummary(response.conversationId, text);
    } catch (error) {
      this.error.set(toMessage(error));
      this.lastFailed.set({ text, history });
    } finally {
      this.loading.set(false);
      this.scrollToBottom();
    }
  }

  private loadSession(conversation: ChatAiConversationView): void {
    this.activeSessionId.set(conversation.id);
    this.followUpQuestion.set(null);
    this.suggestions.set(DEFAULT_SUGGESTIONS);
    this.messages.set([
      { id: GREETING_ID, role: 'assistant', content: GREETING },
      ...conversation.messages.map((message) => ({
        id: this.nextId++,
        role: message.role,
        content: message.content,
        products: message.products,
      })),
    ]);
  }

  /** Cập nhật danh sách phiên ngay sau khi server trả lời (không cần tải lại). */
  private upsertSessionSummary(id: string, firstQuestion: string): void {
    const existing = this.sessions().find((session) => session.id === id);
    const summary: ChatAiConversationSummary = {
      id,
      title: existing?.title ?? sessionTitle(firstQuestion),
      updatedAt: new Date().toISOString(),
      messageCount: (existing?.messageCount ?? 0) + 2,
    };
    this.sessions.set([summary, ...this.sessions().filter((session) => session.id !== id)]);
  }

  /** Tải lịch sử chat từ server; chưa gửi câu nào thì mở luôn phiên gần nhất. */
  private loadRemoteSessions(): void {
    this.aiChatApi.conversations().subscribe({
      next: (list) => {
        this.sessions.set(list);
        if (this.started() || this.loading()) return;
        if (list[0]) {
          this.aiChatApi.conversation(list[0].id).subscribe({
            next: (conversation) => {
              this.loadSession(conversation);
              this.started.set(false);
            },
            error: () => this.started.set(false),
          });
        } else {
          this.startNewSession();
          this.started.set(false);
        }
      },
      error: () => undefined,
    });
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

/** Rút gọn tiêu đề phiên từ câu hỏi đầu tiên của khách. */
function sessionTitle(text: string, maxLength = 52): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function toMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string } } | null;
    return body?.error?.message ?? 'Không kết nối được trợ lý, anh/chị thử lại sau nhé.';
  }
  return 'Có lỗi xảy ra, anh/chị thử lại sau nhé.';
}
