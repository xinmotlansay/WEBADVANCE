import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, ChatAiAskRequest, ChatAiAskResponse } from 'shared';
import { ChatUiService } from '../../../../core/chat/chat-ui.service';

const API_BASE = '/api/v1/chat';

const GREETING =
  'Dạ, em là trợ lý AI của CaraVeso. Em có thể tư vấn sản phẩm nội thất, bảo hành, đổi trả, giao hàng và thanh toán. Anh/chị cần em hỗ trợ gì ạ?';

const DEFAULT_SUGGESTIONS = [
  'Sofa da phù hợp phòng 20m²?',
  'Chính sách đổi trả thế nào?',
  'Phí giao hàng tính ra sao?',
];

interface AiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

/** Khung trợ lý AI công khai, mở từ nút sparkles ở chân trang. Không lưu DB. */
@Component({
  selector: 'app-ai-chat-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-chat-bar.component.html',
  styleUrl: './ai-chat-bar.component.scss',
})
export class AiChatBarComponent {
  private readonly http = inject(HttpClient);
  protected readonly ui = inject(ChatUiService);

  protected readonly messages = signal<AiMessage[]>([
    { id: 1, role: 'assistant', content: GREETING },
  ]);
  protected readonly suggestions = signal<string[]>(DEFAULT_SUGGESTIONS);
  protected readonly draft = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSend = computed(
    () => this.draft().trim().length > 0 && !this.loading(),
  );

  private readonly scrollRef = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private nextId = 2;

  constructor() {
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

  protected close(): void {
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

  protected sendSuggestion(prompt: string): void {
    void this.send(prompt);
  }

  protected async send(override?: string): Promise<void> {
    const text = (override ?? this.draft()).trim();
    if (!text || this.loading()) return;

    const history = this.messages()
      .filter((message) => message.id !== 1)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    this.messages.update((messages) => [
      ...messages,
      { id: this.nextId++, role: 'user', content: text },
    ]);
    this.draft.set('');
    this.error.set(null);
    this.loading.set(true);
    this.scrollToBottom();

    try {
      const body: ChatAiAskRequest = { message: text, history };
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ChatAiAskResponse>>(`${API_BASE}/ai/ask`, body),
      );

      this.messages.update((messages) => [
        ...messages,
        { id: this.nextId++, role: 'assistant', content: response.data.reply },
      ]);
      if (response.data.suggestions.length > 0) {
        this.suggestions.set(response.data.suggestions);
      }
    } catch (error) {
      this.error.set(toMessage(error));
    } finally {
      this.loading.set(false);
      this.scrollToBottom();
    }
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

function toMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string } } | null;
    return body?.error?.message ?? 'Không kết nối được trợ lý, anh/chị thử lại sau nhé.';
  }
  return 'Có lỗi xảy ra, anh/chị thử lại sau nhé.';
}
