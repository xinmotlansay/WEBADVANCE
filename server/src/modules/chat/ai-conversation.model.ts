import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/** Một tin nhắn trong phiên hội thoại AI đã lưu. */
export interface AiConversationStoredMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Thẻ sản phẩm AI gợi ý kèm tin nhắn; giữ nguyên như client nhận được. */
  products?: unknown[];
  model?: string | null;
  createdAt: Date;
}

export interface IAiConversation {
  /** Mã phiên do client sinh hoặc server sinh; duy nhất toàn hệ thống. */
  conversationId: string;
  userId: Types.ObjectId | null;
  /** Mã khách vãng lai lưu trong cookie httpOnly. */
  guestId: string | null;
  title: string;
  channel: 'public' | 'account';
  messages: AiConversationStoredMessage[];
  messageCount: number;
  lastMessageAt: Date;
  /** Chỉ phiên của khách vãng lai mới có mốc hết hạn (TTL index). */
  guestExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const aiConversationMessageSchema = new Schema<AiConversationStoredMessage>(
  {
    role: { type: String, required: true, enum: ['user', 'assistant'] },
    content: { type: String, required: true, maxlength: 8000 },
    products: { type: [Schema.Types.Mixed], default: undefined },
    model: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const aiConversationSchema = new Schema<IAiConversation>(
  {
    conversationId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    guestId: { type: String, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    channel: { type: String, required: true, enum: ['public', 'account'], default: 'public' },
    messages: { type: [aiConversationMessageSchema], default: [] },
    messageCount: { type: Number, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: Date.now, required: true },
    guestExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiConversationSchema.index({ conversationId: 1 }, { unique: true });
aiConversationSchema.index({ userId: 1, lastMessageAt: -1 });
aiConversationSchema.index({ guestId: 1, lastMessageAt: -1 });
/** Tự xoá hội thoại của khách vãng lai sau khi hết hạn. */
aiConversationSchema.index({ guestExpiresAt: 1 }, { expireAfterSeconds: 0 });

export type AiConversationDocument = HydratedDocument<IAiConversation>;
export const AiConversationModel = model<IAiConversation>(
  'ai_conversations',
  aiConversationSchema,
);
