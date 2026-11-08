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
      metadata: { provider: 'gemini' },
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
      metadata: { provider: 'gemini' },
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

describe('tên người trả lời', () => {
  const sentAt = new Date('2026-10-26T03:00:00.000Z');
  const message = (senderType: string, senderId: unknown) =>
    ({
      _id: '665f00000000000000000001',
      sessionId: '665f00000000000000000002',
      senderId,
      senderType,
      content: 'Dạ em chào anh/chị',
      messageType: 'TEXT',
      isRead: false,
      sentAt,
      metadata: null,
    }) as unknown as ChatMessageDocument;

  it('tin của nhân viên mang tên admin đã trả lời (senderId đã populate)', () => {
    const view = toMessageView(
      message('AGENT', { _id: '665f00000000000000000007', profile: { fullName: 'Minh Order' } }),
    );
    expect(view.senderId).toBe('665f00000000000000000007');
    expect(view.senderName).toBe('Minh Order');
  });

  it('tin của khách và hệ thống không có senderName', () => {
    expect(toMessageView(message('CUSTOMER', '665f00000000000000000003'))).not.toHaveProperty('senderName');
    expect(toMessageView(message('SYSTEM', null))).not.toHaveProperty('senderName');
  });

  it('tin của nhân viên chưa populate vẫn trả đúng id, tên để trống', () => {
    const view = toMessageView(message('AGENT', '665f00000000000000000007'));
    expect(view.senderId).toBe('665f00000000000000000007');
    expect(view.senderName).toBeNull();
  });

  it('phiên có admin đang xử lý (agentId đã populate) trả id và tên', () => {
    const view = toSessionView({
      _id: '665f00000000000000000001',
      customerId: '665f00000000000000000009',
      agentId: { _id: '665f00000000000000000007', profile: { fullName: 'Minh Order' } },
      mode: ChatMode.SUPPORT,
      status: ChatSessionStatus.IN_PROGRESS,
      startedAt: new Date('2026-10-26T01:00:00.000Z'),
      endedAt: null,
      lastMessageAt: new Date('2026-10-26T02:00:00.000Z'),
      handoffAt: null,
      lastMessagePreview: '',
      customerUnread: 0,
      agentUnread: 0,
    } as unknown as ChatSessionDocument);
    expect(view.agentId).toBe('665f00000000000000000007');
    expect(view.agent).toEqual({ id: '665f00000000000000000007', fullName: 'Minh Order' });
  });
});
