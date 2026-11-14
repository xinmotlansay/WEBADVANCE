import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  ApiResponse,
  ChatAiAskRequest,
  ChatAiAskResponse,
  ChatAiConversationSummary,
  ChatAiConversationView,
  ChatAiHistoryItem,
} from 'shared';

const API_BASE = '/api/v1/chat/ai';

/** Hội thoại AI công khai: server lưu theo tài khoản hoặc cookie khách vãng lai. */
@Injectable({ providedIn: 'root' })
export class AiChatApiService {
  private readonly http = inject(HttpClient);

  ask(
    message: string,
    history: ChatAiHistoryItem[],
    conversationId: string | null,
  ): Observable<ChatAiAskResponse> {
    const body: ChatAiAskRequest = {
      message,
      history,
      ...(conversationId ? { conversationId } : {}),
    };
    return this.http
      .post<ApiResponse<ChatAiAskResponse>>(`${API_BASE}/ask`, body, { withCredentials: true })
      .pipe(map((response) => response.data));
  }

  conversations(): Observable<ChatAiConversationSummary[]> {
    return this.http
      .get<ApiResponse<{ conversations: ChatAiConversationSummary[] }>>(`${API_BASE}/conversations`, {
        withCredentials: true,
      })
      .pipe(map((response) => response.data.conversations));
  }

  conversation(id: string): Observable<ChatAiConversationView> {
    return this.http
      .get<ApiResponse<{ conversation: ChatAiConversationView }>>(
        `${API_BASE}/conversations/${id}`,
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.conversation));
  }

  rename(id: string, title: string): Observable<ChatAiConversationSummary> {
    return this.http
      .patch<ApiResponse<{ conversation: ChatAiConversationSummary }>>(
        `${API_BASE}/conversations/${id}`,
        { title },
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.conversation));
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${API_BASE}/conversations/${id}`, { withCredentials: true });
  }

  /** Gộp hội thoại của khách vãng lai vào tài khoản sau khi đăng nhập. */
  mergeGuest(): Observable<{ merged: number }> {
    return this.http
      .post<ApiResponse<{ merged: number }>>(`${API_BASE}/conversations/merge`, {}, { withCredentials: true })
      .pipe(map((response) => response.data));
  }
}
