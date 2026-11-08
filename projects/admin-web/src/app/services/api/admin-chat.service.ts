import type { Observable } from 'rxjs';
import type { ChatMessageView, ChatSessionView } from 'shared';

export abstract class AdminChatApi {
  abstract sessions(status?: string): Observable<ChatSessionView[]>;
  abstract messages(sessionId: string): Observable<{ session: ChatSessionView; messages: ChatMessageView[] }>;
  abstract claim(sessionId: string): Observable<ChatSessionView>;
  abstract send(sessionId: string, content: string): Observable<ChatMessageView>;
  abstract close(sessionId: string): Observable<ChatSessionView>;
}
