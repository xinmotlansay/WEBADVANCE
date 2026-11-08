import type { ChatAiProductSuggestion } from 'shared';

/** Tin nhắn được lưu lại trong localStorage (không lưu id vì id chỉ dùng để render). */
export interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  products?: ChatAiProductSuggestion[];
}

export interface StoredChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: StoredChatMessage[];
}

const STORAGE_KEY = 'caraveso.ai.sessions.v1';

/** Số phiên tối đa giữ lại trên trình duyệt. */
export const MAX_STORED_SESSIONS = 20;

/** Đọc lịch sử phiên chat; lỗi/không có dữ liệu thì trả mảng rỗng. */
export function readChatSessions(storage: Storage | null = safeStorage()): StoredChatSession[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isSession)
      .map((session) => ({ ...session, messages: session.messages.filter(isMessage) }))
      .filter((session) => session.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_SESSIONS);
  } catch {
    return [];
  }
}

/** Ghi đè lịch sử phiên chat (nuốt lỗi khi trình duyệt chặn localStorage). */
export function writeChatSessions(
  sessions: StoredChatSession[],
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_STORED_SESSIONS)));
  } catch {
    // Hết quota hoặc chế độ riêng tư: bỏ qua, chat vẫn dùng được trong phiên hiện tại.
  }
}

/** Rút gọn tiêu đề phiên từ câu hỏi đầu tiên của khách. */
export function sessionTitle(text: string, maxLength = 52): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is StoredChatSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<StoredChatSession>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.updatedAt === 'number' &&
    Array.isArray(record.messages)
  );
}

function isMessage(value: unknown): value is StoredChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<StoredChatMessage>;
  return (
    (record.role === 'user' || record.role === 'assistant') && typeof record.content === 'string'
  );
}
