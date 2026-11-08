import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import {
  ChatMessageType,
  ChatMode,
  ChatSenderType,
  ChatSessionStatus,
} from '../../lib/shared-enums.js';

export interface IChatSession {
  customerId: Types.ObjectId;
  agentId: Types.ObjectId | null;
  mode: ChatMode;
  status: ChatSessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  lastMessageAt: Date;
  handoffAt: Date | null;
  lastMessagePreview: string;
  customerUnread: number;
  agentUnread: number;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mode: { type: String, enum: Object.values(ChatMode), default: ChatMode.AI, required: true },
    status: {
      type: String,
      enum: Object.values(ChatSessionStatus),
      default: ChatSessionStatus.AI_ACTIVE,
      required: true,
    },
    startedAt: { type: Date, default: Date.now, required: true },
    endedAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now, required: true },
    handoffAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '', maxlength: 160 },
    customerUnread: { type: Number, default: 0, min: 0 },
    agentUnread: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

chatSessionSchema.index({ customerId: 1, status: 1, lastMessageAt: -1 });
chatSessionSchema.index({ mode: 1, status: 1, lastMessageAt: -1 });

export type ChatSessionDocument = HydratedDocument<IChatSession>;
export const ChatSessionModel = model<IChatSession>('ChatSession', chatSessionSchema);

export interface IChatMessage {
  sessionId: Types.ObjectId;
  senderId: Types.ObjectId | null;
  senderType: ChatSenderType;
  content: string;
  messageType: ChatMessageType;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  sentAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    senderType: {
      type: String,
      enum: Object.values(ChatSenderType),
      required: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    messageType: {
      type: String,
      enum: Object.values(ChatMessageType),
      default: ChatMessageType.TEXT,
    },
    metadata: { type: Schema.Types.Mixed, default: null },
    isRead: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true },
);

chatMessageSchema.index({ sessionId: 1, sentAt: 1 });

export type ChatMessageDocument = HydratedDocument<IChatMessage>;
export const ChatMessageModel = model<IChatMessage>('ChatMessage', chatMessageSchema);
