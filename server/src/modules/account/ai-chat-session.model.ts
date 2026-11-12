import { Schema, model, type Types } from 'mongoose';

export interface AiChatSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Thẻ sản phẩm AI đã gợi ý kèm tin nhắn; giữ nguyên như client nhận được. */
  products?: unknown[];
}

export interface AiChatSessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Mã phiên do client sinh, duy nhất trong phạm vi một người dùng. */
  sessionId: string;
  title: string;
  /** Mốc thời gian (ms) của tin nhắn cuối, dùng để sắp xếp. */
  lastMessageAt: number;
  messages: AiChatSessionMessage[];
}

const aiChatSessionSchema = new Schema<AiChatSessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    lastMessageAt: { type: Number, required: true },
    messages: [
      {
        _id: false,
        role: { type: String, required: true, enum: ['user', 'assistant'] },
        content: { type: String, required: true },
        products: { type: [Schema.Types.Mixed], default: undefined },
      },
    ],
  },
  { timestamps: true },
);

aiChatSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
aiChatSessionSchema.index({ userId: 1, lastMessageAt: -1 });

export const AiChatSessionModel = model<AiChatSessionDoc>('ai_chat_sessions', aiChatSessionSchema);
