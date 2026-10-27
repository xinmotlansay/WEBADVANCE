import type {
  ChatMessageType,
  ChatMode,
  ChatSenderType,
  ChatSessionStatus,
} from '../enums/chat.enum';

export interface ChatSessionView {
  id: string;
  customerId: string;
  agentId: string | null;
  mode: ChatMode;
  status: ChatSessionStatus;
  startedAt: string;
  endedAt: string | null;
  lastMessageAt: string;
  handoffAt: string | null;
  lastMessagePreview: string;
  customerUnread: number;
  agentUnread: number;
  customer?: ChatCustomerView;
}

export interface ChatCustomerView {
  id: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  avatar: string;
}

export interface ChatMessageView {
  id: string;
  sessionId: string;
  senderId: string | null;
  senderType: ChatSenderType;
  content: string;
  messageType: ChatMessageType;
  isRead: boolean;
  sentAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ChatSessionResponse {
  session: ChatSessionView;
}

export interface ChatSessionListResponse {
  sessions: ChatSessionView[];
}

export interface ChatMessagesResponse {
  session: ChatSessionView;
  messages: ChatMessageView[];
  hasMore: boolean;
}

export interface ChatOpenSessionRequest {
  mode?: ChatMode;
}

export interface ChatSendMessageRequest {
  content: string;
}

/** Một lượt hội thoại gửi kèm để AI công khai có ngữ cảnh (không lưu DB). */
export interface ChatAiHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatAiAskRequest {
  message: string;
  history?: ChatAiHistoryItem[];
}

/** Thẻ sản phẩm AI gợi ý kèm đầy đủ thuộc tính để hiển thị trong khung chat. */
export interface ChatAiProductSuggestion {
  id: string;
  name: string;
  slug: string;
  thumbnail: string;
  price: number;
  originalPrice?: number;
  attributes: string[];
  colors: string[];
  category: string[];
  room: string[];
  material?: string;
  dimensions?: string;
  stockStatus?: string;
  warrantyMonths?: number;
  hasPromotion: boolean;
}

export interface ChatAiAskResponse {
  reply: string;
  suggestions: string[];
  products: ChatAiProductSuggestion[];
  provider: 'gemini';
}

export interface ChatSendMessageResponse {
  session: ChatSessionView;
  message: ChatMessageView;
  reply: ChatMessageView | null;
}

export interface ChatHandoffResponse {
  session: ChatSessionView;
  message: ChatMessageView;
}

export interface ChatReadResponse {
  session: ChatSessionView;
}

/** Sự kiện Socket.IO dùng chung giữa backend và các app Angular. */
export interface ChatMessageEvent {
  sessionId: string;
  message: ChatMessageView;
  session: ChatSessionView;
}

export interface ChatSessionUpdatedEvent {
  session: ChatSessionView;
}

export interface ChatTypingEvent {
  sessionId: string;
  senderType: ChatSenderType;
  isTyping: boolean;
}
