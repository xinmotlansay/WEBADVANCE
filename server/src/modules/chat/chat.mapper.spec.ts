import { describe, expect, it } from 'vitest';
import { ChatMode, ChatSenderType, ChatSessionStatus } from '../../lib/shared-enums.js';
import type { ChatMessageDocument, ChatSessionDocument } from './chat.model.js';
import { buildMessagePreview, toMessageView, toSessionView } from './chat.mapper.js';

describe('buildMessagePreview', () => {
  it('gộp khoảng trắng và cắt khoảng 160 ký tự', () => {
    const preview = buildMessagePreview('  Xin   chào\n\nCaraVeso  ');
    expect(preview).toBe('Xin chào CaraVeso');
  });

  it('thêm dấu ba chấm khi nội dung quá dài', () => {
    const preview = buildMessagePreview('a'.repeat(200));
    expect(preview).toHaveLength(160);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('toMessageView', () => {
  it('chuyển document sang view với thời gian ISO', () => {
    const sentAt = new Date('2026-10-26T03:00:00.000Z');
    const document = {
      _id: '665f00000000000000000001',
      sessionId: '665f00000000000000000002',
      senderId: '665f00000000000000000003',
      senderType: ChatSenderType.CUSTOMER,
      content: 'Xin chào',
      messageType: 'TEXT',
      isRead: false,
      sentAt,
      metadata: { provider: 'n8n' },
    } as unknown as ChatMessageDocument;

    expect(toMessageView(document)).toEqual({
      id: '665f00000000000000000001',
      sessionId: '665f00000000000000000002',
      senderId: '665f00000000000000000003',
      senderType: ChatSenderType.CUSTOMER,
      content: 'Xin chào',
      messageType: 'TEXT',
      isRead: false,
      sentAt: sentAt.toISOString(),
      metadata: { provider: 'n8n' },
    });
  });
});

describe('toSessionView', () => {
  it('lấy thông tin khách đã populate và giữ đúng trạng thái', () => {
    const document = {
      _id: '665f00000000000000000001',
      customerId: {
        _id: '665f00000000000000000009',
        profile: { fullName: 'Nguyễn Văn A' },
        email: 'a@example.com',
        phoneNumber: null,
        avatar: '',
      },
      agentId: null,
      mode: ChatMode.SUPPORT,
      status: ChatSessionStatus.WAITING,
      startedAt: new Date('2026-10-26T01:00:00.000Z'),
      endedAt: null,
      lastMessageAt: new Date('2026-10-26T02:00:00.000Z'),
      handoffAt: new Date('2026-10-26T02:00:00.000Z'),
      lastMessagePreview: 'Cần hỗ trợ',
      customerUnread: 1,
      agentUnread: 2,
    } as unknown as ChatSessionDocument;

    const view = toSessionView(document);

    expect(view.customerId).toBe('665f00000000000000000009');
    expect(view.customer?.fullName).toBe('Nguyễn Văn A');
    expect(view.mode).toBe(ChatMode.SUPPORT);
    expect(view.status).toBe(ChatSessionStatus.WAITING);
    expect(view.lastMessageAt).toBe('2026-10-26T02:00:00.000Z');
    expect(view.agentId).toBeNull();
  });
});
