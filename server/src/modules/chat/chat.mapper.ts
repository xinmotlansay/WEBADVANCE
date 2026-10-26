import type { ChatCustomerView, ChatMessageView, ChatSessionView } from '../../lib/shared-api.js';
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

export function toSessionView(session: ChatSessionDocument): ChatSessionView {
  const customer = mapCustomer(session.customerId);

  return {
    id: String(session._id),
    customerId: customer?.id ?? String(session.customerId),
    agentId: session.agentId ? String(session.agentId) : null,
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
  };
}

export function toMessageView(message: ChatMessageDocument): ChatMessageView {
  return {
    id: String(message._id),
    sessionId: String(message.sessionId),
    senderId: message.senderId ? String(message.senderId) : null,
    senderType: message.senderType,
    content: message.content,
    messageType: message.messageType,
    isRead: message.isRead,
    sentAt: message.sentAt.toISOString(),
    metadata: message.metadata ?? null,
  };
}
