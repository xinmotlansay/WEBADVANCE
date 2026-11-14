import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../lib/app-error.js';
import type { GeminiChatHistoryItem } from '../../integrations/gemini.js';
import {
  AiConversationModel,
  type AiConversationDocument,
  type AiConversationStoredMessage,
} from './ai-conversation.model.js';
import { AiChatSessionModel } from '../account/ai-chat-session.model.js';
import { aiOwnerFilter, type AiOwner } from './chat-ai-owner.js';

/** Số phiên tối đa giữ cho mỗi chủ sở hữu (khớp giới hạn phía trình duyệt). */
export const MAX_AI_CONVERSATIONS = 20;
/** Số tin nhắn tối đa giữ trong một phiên; tin cũ hơn bị cắt bớt. */
export const MAX_AI_CONVERSATION_MESSAGES = 100;
/** Khách vãng lai: hội thoại tự xoá sau 30 ngày không hoạt động. */
export const AI_GUEST_RETENTION_DAYS = 30;

const TITLE_PLACEHOLDER = 'Cuộc trò chuyện mới';
const CONVERSATION_ID_PATTERN = /^[\w-]{1,64}$/;

export interface AiConversationSummaryView {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface AiConversationMessageView {
  role: 'user' | 'assistant';
  content: string;
  products?: unknown[];
  createdAt: string;
}

export interface AiConversationView {
  id: string;
  title: string;
  updatedAt: string;
  messages: AiConversationMessageView[];
}

export interface AppendMessageInput {
  role: 'user' | 'assistant';
  content: string;
  products?: unknown[];
  model?: string | null;
}

function guestExpiry(): Date | null {
  return new Date(Date.now() + AI_GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Tạo phiên mới (hoặc dùng lại phiên còn thuộc chủ sở hữu). */
export async function ensureAiConversation(
  owner: AiOwner,
  conversationId?: string,
): Promise<AiConversationDocument> {
  const requested = conversationId?.trim();
  if (requested) {
    if (!CONVERSATION_ID_PATTERN.test(requested)) {
      throw new AppError('VALIDATION_ERROR', 400, 'Mã phiên chat không hợp lệ');
    }
    const owned = await AiConversationModel.findOne({
      conversationId: requested,
      ...aiOwnerFilter(owner),
    });
    if (owned) return owned;
    const exists = await AiConversationModel.exists({ conversationId: requested });
    if (exists) {
      throw new AppError('CHAT_AI_CONVERSATION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
    }
  }

  const id = requested && CONVERSATION_ID_PATTERN.test(requested) ? requested : randomUUID();
  return AiConversationModel.create({
    conversationId: id,
    userId: owner.userId,
    guestId: owner.userId ? null : owner.guestId,
    title: TITLE_PLACEHOLDER,
    channel: owner.userId ? 'account' : 'public',
    messages: [],
    messageCount: 0,
    lastMessageAt: new Date(),
    guestExpiresAt: owner.userId ? null : guestExpiry(),
  });
}

/** Ghi thêm tin nhắn vào phiên, cập nhật tiêu đề và dọn phiên vượt giới hạn. */
export async function appendAiMessages(
  owner: AiOwner,
  conversationId: string,
  entries: AppendMessageInput[],
): Promise<void> {
  if (entries.length === 0) return;

  const conversation = await AiConversationModel.findOne({
    conversationId,
    ...aiOwnerFilter(owner),
  });
  if (!conversation) {
    throw new AppError('CHAT_AI_CONVERSATION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }

  const now = new Date();
  const messages: AiConversationStoredMessage[] = entries.map((entry, index) => ({
    role: entry.role,
    content: entry.content,
    ...(entry.products?.length ? { products: entry.products } : {}),
    model: entry.model ?? null,
    // Giữ đúng thứ tự dù các tin được ghi trong cùng một lần.
    createdAt: new Date(now.getTime() + index),
  }));

  conversation.messages.push(...messages);
  if (conversation.messages.length > MAX_AI_CONVERSATION_MESSAGES) {
    conversation.messages = conversation.messages.slice(-MAX_AI_CONVERSATION_MESSAGES);
  }
  if (conversation.title === TITLE_PLACEHOLDER) {
    const firstUser = conversation.messages.find((message) => message.role === 'user');
    if (firstUser) conversation.title = buildTitle(firstUser.content);
  }
  conversation.messageCount += messages.length;
  conversation.lastMessageAt = messages[messages.length - 1]!.createdAt;
  conversation.guestExpiresAt = owner.userId ? null : guestExpiry();
  await conversation.save();

  await pruneAiConversations(owner);
}

/** Lịch sử gửi kèm Gemini (tối đa `limit` tin gần nhất). */
export async function loadAiHistory(
  owner: AiOwner,
  conversationId: string,
  limit: number,
): Promise<GeminiChatHistoryItem[]> {
  const conversation = await AiConversationModel.findOne({
    conversationId,
    ...aiOwnerFilter(owner),
  }).lean();
  if (!conversation) return [];
  return conversation.messages.slice(-limit).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export async function listAiConversations(owner: AiOwner): Promise<AiConversationSummaryView[]> {
  if (owner.userId) await migrateLegacyAiChatSessions(owner.userId);

  const docs = await AiConversationModel.find(aiOwnerFilter(owner))
    .sort({ lastMessageAt: -1 })
    .limit(MAX_AI_CONVERSATIONS)
    .select({ conversationId: 1, title: 1, lastMessageAt: 1, messageCount: 1 })
    .lean();
  return docs.map(toSummary);
}

export async function getAiConversation(
  owner: AiOwner,
  conversationId: string,
): Promise<AiConversationView> {
  const doc = await AiConversationModel.findOne({
    conversationId,
    ...aiOwnerFilter(owner),
  }).lean();
  if (!doc) {
    throw new AppError('CHAT_AI_CONVERSATION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  return {
    id: doc.conversationId,
    title: doc.title,
    updatedAt: doc.lastMessageAt.toISOString(),
    messages: doc.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.products?.length ? { products: message.products } : {}),
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function renameAiConversation(
  owner: AiOwner,
  conversationId: string,
  title: string,
): Promise<AiConversationSummaryView> {
  const doc = await AiConversationModel.findOneAndUpdate(
    { conversationId, ...aiOwnerFilter(owner) },
    { $set: { title: buildTitle(title) } },
    { new: true },
  ).lean();
  if (!doc) {
    throw new AppError('CHAT_AI_CONVERSATION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  return toSummary(doc);
}

export async function deleteAiConversation(
  owner: AiOwner,
  conversationId: string,
): Promise<void> {
  const result = await AiConversationModel.deleteOne({
    conversationId,
    ...aiOwnerFilter(owner),
  });
  if (result.deletedCount === 0) {
    throw new AppError('CHAT_AI_CONVERSATION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
}

/**
 * Gộp hội thoại khách vãng lai vào tài khoản ngay sau khi đăng nhập.
 * Phiên trùng mã đã thuộc tài khoản thì giữ phiên của tài khoản.
 */
export async function mergeGuestAiConversations(
  guestId: string | null,
  userId: Types.ObjectId,
): Promise<number> {
  if (!guestId) return 0;

  const guestDocs = await AiConversationModel.find({ guestId, userId: null });
  let merged = 0;
  for (const doc of guestDocs) {
    const duplicated = await AiConversationModel.exists({
      userId,
      conversationId: doc.conversationId,
    });
    if (duplicated) {
      await doc.deleteOne();
      continue;
    }
    doc.userId = userId;
    doc.guestId = null;
    doc.channel = 'account';
    doc.guestExpiresAt = null;
    await doc.save();
    merged += 1;
  }

  await pruneAiConversations({ userId, guestId: null });
  return merged;
}

/** Tài khoản đã chuyển dữ liệu cũ trong một lần chạy server. */
const migratedLegacyUsers = new Set<string>();

/**
 * Chuyển lịch sử chat AI kiểu cũ (`ai_chat_sessions`) sang collection mới.
 * Chỉ chạy khi tài khoản chưa có phiên nào trong collection mới.
 */
async function migrateLegacyAiChatSessions(userId: Types.ObjectId): Promise<void> {
  const key = String(userId);
  if (migratedLegacyUsers.has(key)) return;
  migratedLegacyUsers.add(key);

  try {
    if ((await AiConversationModel.countDocuments({ userId })) > 0) return;
    const legacy = await AiChatSessionModel.find({ userId })
      .sort({ lastMessageAt: -1 })
      .limit(MAX_AI_CONVERSATIONS)
      .lean();
    if (legacy.length === 0) return;

    await AiConversationModel.insertMany(
      legacy.map((doc) => {
        const lastMessageAt = new Date(doc.lastMessageAt);
        return {
          conversationId: doc.sessionId,
          userId,
          guestId: null,
          title: doc.title,
          channel: 'account' as const,
          messages: doc.messages.map((message, index) => ({
            role: message.role,
            content: message.content,
            ...(message.products?.length ? { products: message.products } : {}),
            model: null,
            // Giữ thứ tự tin nhắn cũ trong cùng một mốc thời gian.
            createdAt: new Date(lastMessageAt.getTime() - (doc.messages.length - index) * 1000),
          })),
          messageCount: doc.messages.length,
          lastMessageAt,
          guestExpiresAt: null,
        };
      }),
      { ordered: false },
    );
  } catch {
    // Lỗi chuyển dữ liệu không được chặn việc xem lịch sử mới.
  }
}

async function pruneAiConversations(owner: AiOwner): Promise<void> {  const stale = await AiConversationModel.find(aiOwnerFilter(owner), { _id: 1 })
    .sort({ lastMessageAt: -1 })
    .skip(MAX_AI_CONVERSATIONS)
    .lean();
  if (stale.length > 0) {
    await AiConversationModel.deleteMany({
      _id: { $in: stale.map((doc) => doc._id) },
    });
  }
}

function toSummary(doc: {
  conversationId: string;
  title: string;
  lastMessageAt: Date;
  messageCount: number;
}): AiConversationSummaryView {
  return {
    id: doc.conversationId,
    title: doc.title,
    updatedAt: doc.lastMessageAt.toISOString(),
    messageCount: doc.messageCount,
  };
}

function buildTitle(text: string, maxLength = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return TITLE_PLACEHOLDER;
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}
