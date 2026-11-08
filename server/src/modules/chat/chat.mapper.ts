import type { ChatAgentView, ChatCustomerView, ChatMessageView, ChatSessionView } from '../../lib/shared-api.js';
import type { ChatMessageDocument, ChatSessionDocument } from './chat.model.js';

const PREVIEW_LENGTH = 160;

export function buildMessagePreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > PREVIEW_LENGTH ? `${normalized.slice(0, PREVIEW_LENGTH - 1)}…` : normalized;
}

interface PopulatedCustomer {
  _id: unknown;
  profile?: { fullName?: string };
  email?: string | null;
  phoneNumber?: string | null;
  avatar?: string;
}

function mapCustomer(raw: unknown): ChatCustomerView | undefined {
  if (!raw || typeof raw !== 'object' || !('profile' in raw)) {
    return undefined;
  }

  const customer = raw as PopulatedCustomer;
  return {
    id: String(customer._id),
    fullName: customer.profile?.fullName ?? '',
    email: customer.email ?? null,
    phoneNumber: customer.phoneNumber ?? null,
    avatar: customer.avatar ?? '',
  };
}

interface PopulatedAgent {
  _id: unknown;
  profile?: { fullName?: string };
}

/** `agentId` có thể là ObjectId thuần hoặc đã populate; chỉ có tên khi đã populate. */
function mapAgent(raw: unknown): ChatAgentView | null {
  if (!raw || typeof raw !== 'object' || !('profile' in raw)) return null;
  const agent = raw as PopulatedAgent;
  return { id: String(agent._id), fullName: agent.profile?.fullName ?? '' };
}

function agentIdOf(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'object' && '_id' in raw && 'profile' in raw) return String((raw as { _id: unknown })._id);
  return String(raw);
}

export function toSessionView(session: ChatSessionDocument): ChatSessionView {
  const customer = mapCustomer(session.customerId);
  const agent = mapAgent(session.agentId);

  return {
    id: String(session._id),
    customerId: customer?.id ?? String(session.customerId),
    agentId: agentIdOf(session.agentId),
    mode: session.mode,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    lastMessageAt: session.lastMessageAt.toISOString(),
    handoffAt: session.handoffAt ? session.handoffAt.toISOString() : null,
    lastMessagePreview: session.lastMessagePreview,
    customerUnread: session.customerUnread,
    agentUnread: session.agentUnread,
    ...(customer ? { customer } : {}),
    ...(agent ? { agent } : {}),
  };
}

/** `senderId` có thể là ObjectId thuần hoặc đã populate (để lấy tên nhân viên). */
function senderOf(raw: unknown): { id: string | null; name: string | null } {
  if (!raw) return { id: null, name: null };
  if (typeof raw === 'object' && '_id' in raw && 'profile' in raw) {
    const user = raw as { _id: unknown; profile?: { fullName?: string } };
    return { id: String(user._id), name: user.profile?.fullName || null };
  }
  return { id: String(raw), name: null };
}

export function toMessageView(message: ChatMessageDocument): ChatMessageView {
  const sender = senderOf(message.senderId);
  return {
    id: String(message._id),
    sessionId: String(message.sessionId),
    senderId: sender.id,
    senderType: message.senderType,
    ...(message.senderType === 'AGENT' ? { senderName: sender.name } : {}),
    content: message.content,
    messageType: message.messageType,
    isRead: message.isRead,
    sentAt: message.sentAt.toISOString(),
    metadata: message.metadata ?? null,
  };
}
