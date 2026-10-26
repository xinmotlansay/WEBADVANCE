import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type {
  ApiResponse,
  ChatHandoffResponse,
  ChatMessageEvent,
  ChatMessageView,
  ChatMessagesResponse,
  ChatReadResponse,
  ChatSendMessageResponse,
  ChatSessionUpdatedEvent,
  ChatSessionView,
} from 'shared';
import { ChatMode, ChatSessionStatus } from 'shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SocketService } from '../../core/socket/socket.service';

const API_BASE = '/api/v1/chat';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly socket = inject(SocketService);

  private readonly _session = signal<ChatSessionView | null>(null);
  private readonly _messages = signal<ChatMessageView[]>([]);
  private readonly _loading = signal(false);
  private readonly _sending = signal(false);
  private readonly _loadingMore = signal(false);
  private readonly _hasMore = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _joinedSessionId = signal<string | null>(null);

  readonly session = this._session.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly sending = this._sending.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly error = this._error.asReadonly();
  readonly connection = this.socket.status;

  readonly unread = computed(() => this._session()?.customerUnread ?? 0);
  readonly mode = computed<ChatMode>(() => this._session()?.mode ?? ChatMode.AI);
  readonly isClosed = computed(() => this._session()?.status === ChatSessionStatus.CLOSED);
  readonly isWaiting = computed(() => this._session()?.status === ChatSessionStatus.WAITING);
  readonly isAgentConnected = computed(
    () =>
      this._session()?.mode === ChatMode.SUPPORT &&
      this._session()?.status === ChatSessionStatus.IN_PROGRESS,
  );
  readonly canRequestAgent = computed(
    () => this._session()?.mode === ChatMode.AI && !this.isClosed(),
  );

  constructor() {
    this.socket.on<ChatMessageEvent>('chat:message', (payload) => this.handleMessage(payload));
    this.socket.on<ChatSessionUpdatedEvent>('chat:session-updated', (payload) => {
      if (this._session()?.id === payload.session.id) {
        this._session.set(payload.session);
      }
    });

    this.socket.on<void>('connect', () => {
      const session = this._session();
      if (session) {
        this.socket.emit('chat:join', { sessionId: session.id });
      }
    });

    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.socket.connect();
      } else {
        this.socket.disconnect();
        this.reset();
      }
    });
  }

  async open(): Promise<void> {
    if (this._loading()) return;

    this._error.set(null);
    this._loading.set(true);

    try {
      const previousId = this._session()?.id;
      const session = await this.ensureSession();
      if (previousId !== session.id || this._messages().length === 0) {
        await this.loadMessages(session.id);
      }
      await this.markRead();
    } catch (error) {
      this._error.set(toMessage(error));
    } finally {
      this._loading.set(false);
    }
  }

  async send(content: string): Promise<boolean> {
    const text = content.trim();
    if (!text || this._sending() || this.isClosed()) {
      return false;
    }

    this._sending.set(true);
    this._error.set(null);

    try {
      const session = await this.ensureSession();
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ChatSendMessageResponse>>(
          `${API_BASE}/sessions/${session.id}/messages`,
          { content: text },
        ),
      );

      this._session.set(response.data.session);
      this.upsertMessages([response.data.message, ...(response.data.reply ? [response.data.reply] : [])]);
      return true;
    } catch (error) {
      this._error.set(toMessage(error));
      return false;
    } finally {
      this._sending.set(false);
    }
  }

  async requestAgent(): Promise<void> {
    const session = this._session();
    if (!session || !this.canRequestAgent()) {
      return;
    }

    this._error.set(null);
    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ChatHandoffResponse>>(`${API_BASE}/sessions/${session.id}/handoff`, {}),
      );
      this._session.set(response.data.session);
      if (response.data.message) {
        this.upsertMessages([response.data.message]);
      }
    } catch (error) {
      this._error.set(toMessage(error));
    }
  }

  async markRead(): Promise<void> {
    const session = this._session();
    if (!session || session.customerUnread === 0) {
      return;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ChatReadResponse>>(`${API_BASE}/sessions/${session.id}/read`, {}),
      );
      this._session.set(response.data.session);
    } catch {
      // Không chặn UI nếu đánh dấu đã đọc thất bại.
    }
  }

  async loadMore(): Promise<void> {
    const session = this._session();
    const oldest = this._messages()[0];
    if (!session || !oldest || this._loadingMore() || !this._hasMore()) {
      return;
    }

    this._loadingMore.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<ChatMessagesResponse>>(`${API_BASE}/sessions/${session.id}/messages`, {
          params: { before: oldest.sentAt, limit: 50 },
        }),
      );
      this._hasMore.set(response.data.hasMore);
      this._messages.update((messages) => [...response.data.messages, ...messages]);
    } catch (error) {
      this._error.set(toMessage(error));
    } finally {
      this._loadingMore.set(false);
    }
  }

  notifyTyping(isTyping: boolean): void {
    const session = this._session();
    if (session) {
      this.socket.emit('chat:typing', { sessionId: session.id, isTyping });
    }
  }

  private async ensureSession(): Promise<ChatSessionView> {
    const existing = this._session();
    if (existing && existing.status !== ChatSessionStatus.CLOSED) {
      this.joinRoom(existing.id);
      return existing;
    }

    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ session: ChatSessionView }>>(`${API_BASE}/sessions`, {}),
    );
    this._session.set(response.data.session);
    this._messages.set([]);
    this.joinRoom(response.data.session.id);
    return response.data.session;
  }

  private async loadMessages(sessionId: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<ChatMessagesResponse>>(`${API_BASE}/sessions/${sessionId}/messages`, {
        params: { limit: 50 },
      }),
    );
    this._session.set(response.data.session);
    this._messages.set(response.data.messages);
    this._hasMore.set(response.data.hasMore);
  }

  private joinRoom(sessionId: string): void {
    if (this._joinedSessionId() === sessionId) return;
    this._joinedSessionId.set(sessionId);
    this.socket.connect();
    this.socket.emit('chat:join', { sessionId });
  }

  private handleMessage(payload: ChatMessageEvent): void {
    const current = this._session();

    if (!current) {
      this._session.set(payload.session);
    } else if (current.id !== payload.sessionId) {
      return;
    } else {
      this._session.set(payload.session);
    }

    this.upsertMessages([payload.message]);
  }

  private upsertMessages(incoming: ChatMessageView[]): void {
    this._messages.update((messages) => {
      const map = new Map(messages.map((message) => [message.id, message]));
      for (const message of incoming) {
        map.set(message.id, message);
      }
      return [...map.values()].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      );
    });
  }

  private reset(): void {
    this._session.set(null);
    this._messages.set([]);
    this._hasMore.set(false);
    this._error.set(null);
    this._joinedSessionId.set(null);
  }
}

function toMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string } } | null;
    return body?.error?.message ?? 'Không thể kết nối tới máy chủ, vui lòng thử lại';
  }
  return 'Có lỗi xảy ra, vui lòng thử lại';
}
