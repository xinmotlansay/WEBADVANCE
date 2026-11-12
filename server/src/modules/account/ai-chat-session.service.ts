import type { Types } from 'mongoose';
import { AiChatSessionModel, type AiChatSessionMessage } from './ai-chat-session.model.js';

/** Số phiên chat AI tối đa giữ cho mỗi tài khoản (khớp với phía trình duyệt). */
export const MAX_AI_CHAT_SESSIONS = 20;

export interface AiChatSessionView {
  id: string;
  title: string;
  updatedAt: number;
  messages: AiChatSessionMessage[];
}

export interface AiChatSessionBody {
  title: string;
  updatedAt: number;
  messages: AiChatSessionMessage[];
}

export async function listAiChatSessions(userId: Types.ObjectId): Promise<AiChatSessionView[]> {
  const docs = await AiChatSessionModel.find({ userId })
    .sort({ lastMessageAt: -1 })
    .limit(MAX_AI_CHAT_SESSIONS)
    .lean();
  return docs.map((doc) => ({
    id: doc.sessionId,
    title: doc.title,
    updatedAt: doc.lastMessageAt,
    messages: doc.messages,
  }));
}

/** Tạo hoặc ghi đè một phiên, rồi xoá các phiên cũ vượt giới hạn. */
export async function saveAiChatSession(
  userId: Types.ObjectId,
  sessionId: string,
  body: AiChatSessionBody,
): Promise<AiChatSessionView> {
  const doc = await AiChatSessionModel.findOneAndUpdate(
    { userId, sessionId },
    {
      $set: { title: body.title, lastMessageAt: body.updatedAt, messages: body.messages },
      $setOnInsert: { userId, sessionId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  const stale = await AiChatSessionModel.find({ userId }, { _id: 1 })
    .sort({ lastMessageAt: -1 })
    .skip(MAX_AI_CHAT_SESSIONS)
    .lean();
  if (stale.length > 0) {
    await AiChatSessionModel.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
  }
  return {
    id: doc.sessionId,
    title: doc.title,
    updatedAt: doc.lastMessageAt,
    messages: doc.messages,
  };
}

export async function deleteAiChatSession(userId: Types.ObjectId, sessionId: string): Promise<void> {
  await AiChatSessionModel.deleteOne({ userId, sessionId });
}
