import { AppError } from '../../lib/app-error.js';
import type { ChatMessageView, ChatSessionView } from '../../lib/shared-api.js';
import {
  ChatMode,
  ChatSenderType,
  ChatSessionStatus as Status,
} from '../../lib/shared-enums.js';
import { getIo } from '../../socket/index.js';
import { UserModel } from '../auth/auth.model.js';
import {
  ChatMessageModel,
  ChatSessionModel,
  type ChatMessageDocument,
  type ChatSessionDocument,
} from './chat.model.js';
import { buildMessagePreview, toMessageView, toSessionView } from './chat.mapper.js';
import { respondWithAi } from './ai-chat.service.js';

function sessionCustomerId(session: ChatSessionDocument): string {
  const raw = session.customerId as unknown;
  if (raw && typeof raw === 'object' && '_id' in raw) {
    return String((raw as { _id: unknown })._id);
  }
  return String(raw);
}

function broadcastMessage(session: ChatSessionDocument, message: ChatMessageDocument): void {
  const io = getIo();
  if (!io) return;

  const payload = {
    sessionId: String(session._id),
    message: toMessageView(message),
    session: toSessionView(session),
  };

  io.to(`chat:${session._id}`)
    .to(`user:${sessionCustomerId(session)}`)
    .to('agents')
    .emit('chat:message', payload);
}

function broadcastSession(session: ChatSessionDocument): void {
  const io = getIo();
  if (!io) return;

  const payload = { session: toSessionView(session) };
  io.to(`user:${sessionCustomerId(session)}`)
    .to('agents')
    .emit('chat:session-updated', payload);
}

function assertOpen(session: ChatSessionDocument): void {
  if (session.status === Status.CLOSED) {
    throw new AppError('CHAT_SESSION_CLOSED', 409, 'Cuộc trò chuyện đã kết thúc, vui lòng mở cuộc trò chuyện mới');
  }
}

async function findCustomerSession(sessionId: string, customerId: string): Promise<ChatSessionDocument> {
  const session = await ChatSessionModel.findOne({
    _id: sessionId,
    customerId,
  }).populate('customerId', 'profile.fullName email phoneNumber avatar');

  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  return session;
}

async function touch(
  session: ChatSessionDocument,
  message: ChatMessageDocument,
  unreadFor: 'agent' | 'customer' | null,
): Promise<void> {
  session.lastMessageAt = message.sentAt;
  session.lastMessagePreview = buildMessagePreview(message.content);
  if (unreadFor === 'agent') session.agentUnread += 1;
  if (unreadFor === 'customer') session.customerUnread += 1;
  await session.save();
}

async function createMessage(input: {
  session: ChatSessionDocument;
  senderId: string | null;
  senderType: ChatSenderType;
  content: string;
  metadata?: Record<string, unknown> | null;
}): Promise<ChatMessageDocument> {
  return ChatMessageModel.create({
    sessionId: input.session._id,
    senderId: input.senderId,
    senderType: input.senderType,
    content: input.content,
    metadata: input.metadata ?? null,
  });
}

export async function openSession(customerId: string): Promise<ChatSessionView> {
  let session = await ChatSessionModel.findOne({
    customerId,
    status: { $ne: Status.CLOSED },
  }).sort({ lastMessageAt: -1 });

  if (!session) {
    session = await ChatSessionModel.create({ customerId });
  }

  return toSessionView(session);
}

export async function listCustomerSessions(customerId: string, limit: number): Promise<ChatSessionView[]> {
  const sessions = await ChatSessionModel.find({ customerId })
    .sort({ lastMessageAt: -1 })
    .limit(limit);

  return sessions.map(toSessionView);
}

export async function listCustomerMessages(
  sessionId: string,
  customerId: string,
  limit: number,
  before?: Date,
): Promise<{ session: ChatSessionView; messages: ChatMessageView[]; hasMore: boolean }> {
  const session = await findCustomerSession(sessionId, customerId);

  const messages = await ChatMessageModel.find({
    sessionId: session._id,
    ...(before ? { sentAt: { $lt: before } } : {}),
  })
    .sort({ sentAt: -1 })
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  return {
    session: toSessionView(session),
    messages: page.map(toMessageView),
    hasMore,
  };
}

export interface SendMessageResult {
  session: ChatSessionView;
  message: ChatMessageView;
  reply: ChatMessageView | null;
}

export async function sendCustomerMessage(
  sessionId: string,
  customerId: string,
  content: string,
): Promise<SendMessageResult> {
  const session = await findCustomerSession(sessionId, customerId);
  assertOpen(session);

  const message = await createMessage({
    session,
    senderId: customerId,
    senderType: ChatSenderType.CUSTOMER,
    content,
  });

  if (session.mode === ChatMode.SUPPORT) {
    await touch(session, message, 'agent');
    broadcastMessage(session, message);
    broadcastSession(session);

    return {
      session: toSessionView(session),
      message: toMessageView(message),
      reply: null,
    };
  }

  await touch(session, message, null);
  broadcastMessage(session, message);
  broadcastSession(session);

  const customer = await UserModel.findById(customerId).select('profile.fullName');
  const aiResult = await respondWithAi(session, message, customer?.profile?.fullName ?? '');

  for (const replyMessage of aiResult.replies) {
    broadcastMessage(aiResult.session, replyMessage);
  }
  broadcastSession(aiResult.session);

  const lastReply = aiResult.replies.at(-1) ?? null;

  return {
    session: toSessionView(aiResult.session),
    message: toMessageView(message),
    reply: lastReply ? toMessageView(lastReply) : null,
  };
}

export async function requestHandoff(
  sessionId: string,
  customerId: string,
): Promise<{ session: ChatSessionView; message: ChatMessageView | null }> {
  const session = await findCustomerSession(sessionId, customerId);
  assertOpen(session);

  if (session.mode === ChatMode.SUPPORT) {
    return { session: toSessionView(session), message: null };
  }

  session.mode = ChatMode.SUPPORT;
  session.status = Status.WAITING;
  session.handoffAt = new Date();
  await session.save();

  const message = await createMessage({
    session,
    senderId: null,
    senderType: ChatSenderType.SYSTEM,
    content: 'Đã kết nối tới nhân viên CSKH. Anh/chị vui lòng chờ trong giây lát nhé.',
  });

  await touch(session, message, 'customer');
  broadcastMessage(session, message);
  broadcastSession(session);

  return { session: toSessionView(session), message: toMessageView(message) };
}

export async function markCustomerRead(sessionId: string, customerId: string): Promise<ChatSessionView> {
  const session = await findCustomerSession(sessionId, customerId);

  if (session.customerUnread !== 0) {
    session.customerUnread = 0;
    await session.save();
  }

  return toSessionView(session);
}

/* ----------------------------- Admin ----------------------------- */

export interface AdminSessionFilter {
  limit: number;
  mode?: ChatMode;
  status?: Status;
}

export async function listAdminSessions(filter: AdminSessionFilter): Promise<ChatSessionView[]> {
  const sessions = await ChatSessionModel.find({
    ...(filter.mode ? { mode: filter.mode } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  })
    .sort({ lastMessageAt: -1 })
    .limit(filter.limit)
    .populate('customerId', 'profile.fullName email phoneNumber avatar');

  return sessions.map(toSessionView);
}

export async function listAdminMessages(
  sessionId: string,
  limit: number,
  before?: Date,
): Promise<{ session: ChatSessionView; messages: ChatMessageView[]; hasMore: boolean }> {
  const session = await ChatSessionModel.findById(sessionId).populate(
    'customerId',
    'profile.fullName email phoneNumber avatar',
  );

  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }

  const messages = await ChatMessageModel.find({
    sessionId: session._id,
    ...(before ? { sentAt: { $lt: before } } : {}),
  })
    .sort({ sentAt: -1 })
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  return {
    session: toSessionView(session),
    messages: page.map(toMessageView),
    hasMore,
  };
}

export async function claimSession(sessionId: string, agentId: string): Promise<ChatSessionView> {
  const session = await ChatSessionModel.findById(sessionId).populate(
    'customerId',
    'profile.fullName email phoneNumber avatar',
  );
  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  assertOpen(session);

  const agent = await UserModel.findById(agentId).select('_id');
  if (!agent) {
    throw new AppError('UNAUTHORIZED', 401, 'Không tìm thấy tài khoản nhân viên');
  }

  session.agentId = session.agentId ?? agent._id;
  session.mode = ChatMode.SUPPORT;
  session.status = Status.IN_PROGRESS;
  session.handoffAt = session.handoffAt ?? new Date();
  await session.save();

  broadcastSession(session);
  return toSessionView(session);
}

export async function sendAgentMessage(
  sessionId: string,
  agentId: string,
  content: string,
): Promise<SendMessageResult> {
  const session = await ChatSessionModel.findById(sessionId).populate(
    'customerId',
    'profile.fullName email phoneNumber avatar',
  );
  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  assertOpen(session);

  const agentObjectId = await UserModel.findById(agentId).select('_id');
  if (!agentObjectId) {
    throw new AppError('UNAUTHORIZED', 401, 'Không tìm thấy tài khoản nhân viên');
  }

  session.mode = ChatMode.SUPPORT;
  session.status = Status.IN_PROGRESS;
  session.agentId = agentObjectId._id;
  session.handoffAt = session.handoffAt ?? new Date();
  await session.save();

  const message = await createMessage({
    session,
    senderId: agentId,
    senderType: ChatSenderType.AGENT,
    content,
  });

  await touch(session, message, 'customer');
  broadcastMessage(session, message);
  broadcastSession(session);

  return {
    session: toSessionView(session),
    message: toMessageView(message),
    reply: null,
  };
}

export async function closeSession(sessionId: string): Promise<ChatSessionView> {
  const session = await ChatSessionModel.findById(sessionId).populate(
    'customerId',
    'profile.fullName email phoneNumber avatar',
  );
  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }

  if (session.status === Status.CLOSED) {
    return toSessionView(session);
  }

  session.status = Status.CLOSED;
  session.endedAt = new Date();
  await session.save();

  const message = await createMessage({
    session,
    senderId: null,
    senderType: ChatSenderType.SYSTEM,
    content: 'Cuộc trò chuyện đã kết thúc. Cảm ơn anh/chị đã liên hệ CaraVeso.',
  });

  await touch(session, message, 'customer');
  broadcastMessage(session, message);
  broadcastSession(session);

  return toSessionView(session);
}
