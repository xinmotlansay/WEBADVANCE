import { AppError } from '../../lib/app-error.js';
import type { ChatMessageView, ChatSessionView } from '../../lib/shared-api.js';
import {
  ChatMode,
  ChatSenderType,
  ChatSessionStatus as Status,
  RoleName,
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

const CUSTOMER_FIELDS = 'profile.fullName email phoneNumber avatar';
const AGENT_FIELDS = 'profile.fullName';

/** Tải phiên kèm thông tin khách và admin đang xử lý (để mọi sự kiện gửi tới admin đều có tên người xử lý). */
async function loadSession(sessionId: string): Promise<ChatSessionDocument> {
  const session = await ChatSessionModel.findById(sessionId)
    .populate('customerId', CUSTOMER_FIELDS)
    .populate('agentId', AGENT_FIELDS);
  if (!session) {
    throw new AppError('CHAT_SESSION_NOT_FOUND', 404, 'Không tìm thấy cuộc trò chuyện');
  }
  return session;
}

function agentNameOf(session: ChatSessionDocument): string {
  const raw = session.agentId as unknown;
  const name =
    raw && typeof raw === 'object' && 'profile' in raw
      ? (raw as { profile?: { fullName?: string } }).profile?.fullName
      : undefined;
  return name || 'nhân viên khác';
}

function agentIdString(session: ChatSessionDocument): string | null {
  const raw = session.agentId as unknown;
  if (!raw) return null;
  if (typeof raw === 'object' && '_id' in raw && 'profile' in raw) return String((raw as { _id: unknown })._id);
  return String(raw);
}

/** Phiên đang do admin khác xử lý thì không được nhận, trả lời hay đóng thay. */
function takenError(session: ChatSessionDocument): AppError {
  return new AppError(
    'CHAT_SESSION_TAKEN',
    409,
    `Phiên này đang được ${agentNameOf(session)} xử lý`,
    { agentId: agentIdString(session) },
  );
}

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
  })
    .populate('customerId', CUSTOMER_FIELDS)
    .populate('agentId', AGENT_FIELDS);

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
  const message = await ChatMessageModel.create({
    sessionId: input.session._id,
    senderId: input.senderId,
    senderType: input.senderType,
    content: input.content,
    metadata: input.metadata ?? null,
  });
  // Tin của nhân viên mang theo tên người trả lời để cả admin lẫn khách thấy ai đang hỗ trợ.
  if (input.senderType === ChatSenderType.AGENT) await message.populate('senderId', AGENT_FIELDS);
  return message;
}

export async function openSession(customerId: string, mode: ChatMode = ChatMode.SUPPORT): Promise<ChatSessionView> {
  // Chat CSKH: dùng lại phiên gần nhất kể cả đã đóng, khách nhắn tiếp thì phiên quay về "Chờ nhận".
  let session = await ChatSessionModel.findOne({
    customerId,
    mode,
    ...(mode === ChatMode.SUPPORT ? {} : { status: { $ne: Status.CLOSED } }),
  })
    .sort({ lastMessageAt: -1 })
    .populate('agentId', AGENT_FIELDS);

  if (!session) {
    session = await ChatSessionModel.create({
      customerId,
      mode,
      status: mode === ChatMode.SUPPORT ? Status.WAITING : Status.AI_ACTIVE,
      handoffAt: mode === ChatMode.SUPPORT ? new Date() : null,
    });
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
    .limit(limit + 1)
    .populate('senderId', AGENT_FIELDS);

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
  if (session.mode === ChatMode.SUPPORT && session.status === Status.CLOSED) {
    // Khách nhắn vào phiên đã đóng: phiên quay về "Chờ nhận" để admin nhận lại.
    session.status = Status.WAITING;
    session.agentId = null;
    session.endedAt = null;
    session.handoffAt = new Date();
  } else {
    assertOpen(session);
  }

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

  const aiResult = await respondWithAi(session, message);

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

export interface ChatAgentActor {
  id: string;
  roleName: RoleName;
}

/**
 * Danh sách phiên cho admin: chỉ các phiên CSKH có tin nhắn (Chờ nhận, Đang xử lý, Đã đóng). Phiên giữa
 * khách và trợ lý AI, hoặc phiên vừa mở chưa có tin nào, không đưa vào hàng đợi của admin.
 */
export async function listAdminSessions(filter: AdminSessionFilter): Promise<ChatSessionView[]> {
  const sessions = await ChatSessionModel.find({
    mode: filter.mode ?? ChatMode.SUPPORT,
    status: filter.status ?? { $in: [Status.WAITING, Status.IN_PROGRESS, Status.CLOSED] },
    lastMessagePreview: { $ne: '' },
  })
    .sort({ lastMessageAt: -1 })
    .limit(filter.limit)
    .populate('customerId', CUSTOMER_FIELDS)
    .populate('agentId', AGENT_FIELDS);

  return sessions.map(toSessionView);
}

export async function listAdminMessages(
  sessionId: string,
  limit: number,
  before?: Date,
): Promise<{ session: ChatSessionView; messages: ChatMessageView[]; hasMore: boolean }> {
  const session = await loadSession(sessionId);

  const messages = await ChatMessageModel.find({
    sessionId: session._id,
    ...(before ? { sentAt: { $lt: before } } : {}),
  })
    .sort({ sentAt: -1 })
    .limit(limit + 1)
    .populate('senderId', AGENT_FIELDS);

  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();

  return {
    session: toSessionView(session),
    messages: page.map(toMessageView),
    hasMore,
  };
}

/**
 * Admin nhận một phiên "Chờ nhận" thành "Đang xử lý". Chuyển trạng thái có điều kiện nên hai admin bấm
 * cùng lúc chỉ một người nhận được; người còn lại nhận lỗi và thấy tên người đang xử lý.
 */
async function takeSession(sessionId: string, agentId: string): Promise<ChatSessionDocument> {
  const agent = await UserModel.findById(agentId).select('_id');
  if (!agent) {
    throw new AppError('UNAUTHORIZED', 401, 'Không tìm thấy tài khoản nhân viên');
  }

  const claimed = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, mode: ChatMode.SUPPORT, status: Status.WAITING },
    { $set: { status: Status.IN_PROGRESS, agentId: agent._id, handoffAt: new Date() } },
    { new: true },
  );
  if (claimed) {
    const session = await loadSession(String(claimed._id));
    broadcastSession(session);
    return session;
  }

  const session = await loadSession(sessionId);
  if (session.status === Status.CLOSED) assertOpen(session);
  if (session.status === Status.IN_PROGRESS) {
    if (agentIdString(session) === agentId) return session;
    throw takenError(session);
  }
  throw new AppError('CHAT_SESSION_NOT_SUPPORT', 409, 'Phiên này đang do trợ lý AI trả lời, chưa cần nhân viên');
}

export async function claimSession(sessionId: string, agentId: string): Promise<ChatSessionView> {
  return toSessionView(await takeSession(sessionId, agentId));
}

export async function sendAgentMessage(
  sessionId: string,
  agentId: string,
  content: string,
): Promise<SendMessageResult> {
  let session = await loadSession(sessionId);
  assertOpen(session);

  if (session.status === Status.WAITING) {
    // Trả lời một phiên đang chờ cũng là nhận phiên đó.
    session = await takeSession(sessionId, agentId);
  } else if (session.status === Status.IN_PROGRESS && agentIdString(session) !== agentId) {
    throw takenError(session);
  } else if (session.status !== Status.IN_PROGRESS) {
    throw new AppError('CHAT_SESSION_NOT_SUPPORT', 409, 'Phiên này đang do trợ lý AI trả lời, chưa cần nhân viên');
  }

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

/**
 * Chuyển phiên sang "Đã đóng". Không gửi thêm dòng "cuộc trò chuyện đã kết thúc" vào hội thoại: khách
 * thấy trạng thái đã đóng ở khung chat, và nhắn lại là phiên quay về "Chờ nhận".
 */
async function finishSession(sessionId: string): Promise<ChatSessionDocument | null> {
  const closed = await ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, status: { $ne: Status.CLOSED } },
    { $set: { status: Status.CLOSED, endedAt: new Date() } },
    { new: true },
  );
  if (!closed) return null;

  const session = await loadSession(String(closed._id));
  broadcastSession(session);
  return session;
}

/**
 * Đóng phiên. Phiên "Đang xử lý" chỉ admin đang xử lý (hoặc Super Admin, để gỡ phiên bị bỏ quên) mới đóng
 * được; phiên "Chờ nhận" admin nào cũng đóng được.
 */
export async function closeSession(sessionId: string, actor: ChatAgentActor): Promise<ChatSessionView> {
  const session = await loadSession(sessionId);
  if (session.status === Status.CLOSED) {
    return toSessionView(session);
  }
  if (
    session.status === Status.IN_PROGRESS &&
    agentIdString(session) !== actor.id &&
    actor.roleName !== RoleName.SUPER_ADMIN
  ) {
    throw takenError(session);
  }

  const closed = await finishSession(sessionId);
  return toSessionView(closed ?? (await loadSession(sessionId)));
}

/** Admin đăng xuất: mọi phiên admin đó đang xử lý chuyển sang "Đã đóng". Trả số phiên đã đóng. */
export async function closeAgentSessions(agentId: string): Promise<number> {
  const sessions = await ChatSessionModel.find({ agentId, status: Status.IN_PROGRESS }).select('_id');
  let closed = 0;
  for (const { _id } of sessions) {
    if (await finishSession(String(_id))) closed += 1;
  }
  return closed;
}
