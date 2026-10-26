import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import {
  ChatMode,
  ChatSenderType,
  ChatSessionStatus,
} from '../../lib/shared-enums.js';
import { callChatWorkflow, isChatWorkflowConfigured } from '../../integrations/n8n.js';
import {
  ChatMessageModel,
  ChatSessionModel,
  type ChatMessageDocument,
  type ChatSessionDocument,
} from './chat.model.js';
import { buildMessagePreview } from './chat.mapper.js';

const POLICIES: Record<string, string> = {
  warranty:
    'Bảo hành tính từ ngày giao thực tế theo từng sản phẩm. Hàng cồng kềnh bảo hành tại nhà, hàng nhỏ gửi về trung tâm; CaraVeso chịu phí hai chiều trong phạm vi bảo hành.',
  return:
    'Đổi hoặc trả trong 7 ngày kể từ ngày giao thực tế, kèm lý do và ảnh/video. Hàng phải còn phụ kiện, bao bì, tem nhãn. Hàng lỗi do vận chuyển hoặc nhà sản xuất cần video mở hàng.',
  shipping:
    'Giao hàng theo cấp độ cồng kềnh 1-4. Hàng cồng kềnh do đội xe CaraVeso giao và lắp đặt theo lịch khách chọn. Phí vận chuyển hiển thị ở bước thanh toán.',
  payment:
    'Thanh toán COD khi nhận hàng hoặc QR ngân hàng. Đơn trên 20.000.000đ cần đặt cọc 30% qua QR trong 15 phút; hết hạn đơn tự hủy.',
  voucher:
    'Mỗi đơn áp dụng tối đa 1 voucher. Voucher công khai, voucher trong ví và voucher gán riêng có điều kiện khác nhau, hiển thị ở bước thanh toán.',
  workingHours:
    'CaraVeso làm việc 8:00-17:30 thứ 2 đến thứ 7. Hotline 1900 080906, email caravesodesign@com.vn. Ngoài giờ, khách để lại tin nhắn và được trả lời vào ngày làm việc kế tiếp.',
};

const DEMO_REPLIES: Array<{ keywords: string[]; reply: string }> = [
  {
    keywords: ['bảo hành', 'hỏng', 'hư', 'lỗi', 'sửa'],
    reply:
      'Dạ, sản phẩm của CaraVeso được bảo hành tính từ ngày giao thực tế theo từng dòng sản phẩm. Hàng cồng kềnh được bảo hành tại nhà, hàng nhỏ gửi về trung tâm và CaraVeso chịu phí hai chiều trong phạm vi bảo hành. Anh/chị cho em biết tên sản phẩm để em kiểm tra thời hạn cụ thể nhé.',
  },
  {
    keywords: ['đổi', 'trả', 'hoàn', '7 ngày'],
    reply:
      'Dạ, CaraVeso hỗ trợ đổi hoặc trả trong 7 ngày kể từ ngày giao thực tế, kèm lý do và ảnh/video. Hàng cần còn phụ kiện, bao bì và tem nhãn. Với hàng lỗi do vận chuyển hoặc nhà sản xuất, anh/chị giúp em quay video lúc mở hàng nhé.',
  },
  {
    keywords: ['giao', 'ship', 'vận chuyển', 'lắp'],
    reply:
      'Dạ, CaraVeso giao hàng theo cấp độ cồng kềnh 1-4. Hàng cồng kềnh do đội xe CaraVeso giao và lắp đặt theo lịch anh/chị chọn. Phí vận chuyển sẽ hiển thị ở bước thanh toán ạ.',
  },
  {
    keywords: ['thanh toán', 'cod', 'qr', 'chuyển khoản', 'cọc'],
    reply:
      'Dạ, anh/chị có thể thanh toán COD khi nhận hàng hoặc chuyển khoản QR. Đơn trên 20.000.000đ cần đặt cọc 30% qua QR trong 15 phút, quá hạn đơn sẽ tự hủy ạ.',
  },
  {
    keywords: ['giờ', 'làm việc', 'hotline', 'liên hệ', 'cskh'],
    reply:
      'Dạ, CaraVeso làm việc 8:00-17:30 thứ 2 đến thứ 7. Hotline 1900 080906, email caravesodesign@com.vn. Ngoài giờ, anh/chị để lại tin nhắn, nhân viên sẽ phản hồi vào ngày làm việc kế tiếp ạ.',
  },
];

const DEMO_FALLBACK =
  'Dạ, em là trợ lý tư vấn của CaraVeso. Hiện em có thể hỗ trợ về sản phẩm nội thất, bảo hành, đổi trả, giao hàng, thanh toán và voucher. Anh/chị cho em biết rõ hơn nhu cầu để em tư vấn nhé.';

export interface AiReplyResult {
  replies: ChatMessageDocument[];
  session: ChatSessionDocument;
  handoff: boolean;
}

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

function buildDemoReply(message: string): string {
  const normalized = message.toLowerCase();
  const matched = DEMO_REPLIES.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return matched?.reply ?? DEMO_FALLBACK;
}

async function loadHistory(sessionId: string, excludedMessageId: string): Promise<HistoryItem[]> {
  const messages = await ChatMessageModel.find({
    sessionId,
    _id: { $ne: excludedMessageId },
    senderType: { $in: [ChatSenderType.CUSTOMER, ChatSenderType.AI] },
  })
    .sort({ sentAt: -1 })
    .limit(config.CHAT_HISTORY_LIMIT)
    .lean();

  return messages.reverse().map((message) => ({
    role: message.senderType === ChatSenderType.AI ? 'assistant' : 'user',
    content: message.content,
  }));
}

async function isAiRateLimited(customerId: string): Promise<boolean> {
  const key = `rl:chat:ai:${customerId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.CHAT_AI_RATE_WINDOW_SECONDS);
    }
    return count > config.CHAT_AI_RATE_LIMIT;
  } catch (error) {
    // Redis lỗi không nên chặn khách chat với AI.
    logger.warn({ err: error, customerId }, 'Không kiểm tra được giới hạn AI, cho phép tiếp tục');
    return false;
  }
}

async function createAiMessage(
  session: ChatSessionDocument,
  content: string,
  metadata: Record<string, unknown> | null = null,
): Promise<ChatMessageDocument> {
  return ChatMessageModel.create({
    sessionId: session._id,
    senderId: null,
    senderType: ChatSenderType.AI,
    content,
    metadata,
  });
}

async function createSystemMessage(
  session: ChatSessionDocument,
  content: string,
): Promise<ChatMessageDocument> {
  return ChatMessageModel.create({
    sessionId: session._id,
    senderId: null,
    senderType: ChatSenderType.SYSTEM,
    content,
  });
}

async function switchToSupport(session: ChatSessionDocument, reason: string): Promise<ChatMessageDocument> {
  const now = new Date();
  session.mode = ChatMode.SUPPORT;
  session.status = ChatSessionStatus.WAITING;
  session.handoffAt = now;
  await session.save();

  const message = await createSystemMessage(
    session,
    reason === 'AI_ERROR'
      ? 'Trợ lý AI đang bận. Cuộc trò chuyện đã được chuyển tới nhân viên CSKH, anh/chị vui lòng chờ trong giây lát.'
      : reason === 'RATE_LIMIT'
        ? 'Anh/chị nhắn hơi nhanh nên trợ lý tạm nghỉ. Cuộc trò chuyện đã được chuyển tới nhân viên CSKH.'
        : 'Đã kết nối tới nhân viên CSKH. Anh/chị vui lòng chờ trong giây lát nhé.',
  );

  session.lastMessageAt = message.sentAt;
  session.lastMessagePreview = buildMessagePreview(message.content);
  session.customerUnread += 1;
  await session.save();

  return message;
}

async function touchSession(session: ChatSessionDocument, message: ChatMessageDocument): Promise<void> {
  session.lastMessageAt = message.sentAt;
  session.lastMessagePreview = buildMessagePreview(message.content);
  await session.save();
}

/**
 * Trả lời tin nhắn của khách bằng AI (qua n8n, hoặc chế độ demo khi chưa cấu hình).
 * Tin nhắn của khách đã được lưu trước khi hàm này chạy.
 */
export async function respondWithAi(
  session: ChatSessionDocument,
  customerMessage: ChatMessageDocument,
  customerName = '',
): Promise<AiReplyResult> {
  const customerId = String(session.customerId);

  if (await isAiRateLimited(customerId)) {
    const systemMessage = await switchToSupport(session, 'RATE_LIMIT');
    return { replies: [systemMessage], session, handoff: true };
  }

  const history = await loadHistory(String(session._id), String(customerMessage._id));
  let reply: string;
  let handoff = false;
  let suggestedProducts: string[] = [];
  let provider = 'demo';

  try {
    if (isChatWorkflowConfigured()) {
      provider = 'n8n';
      const result = await callChatWorkflow({
        sessionId: String(session._id),
        message: customerMessage.content,
        history,
        customer: { id: customerId, fullName: customerName },
        context: { products: [], policies: POLICIES },
      });

      if (!result) {
        throw new Error('Workflow không trả về dữ liệu');
      }
      if (result.error && !result.reply) {
        throw new Error(result.error);
      }

      reply = result.reply;
      handoff = result.handoff;
      suggestedProducts = result.suggestedProducts;
    } else {
      reply = buildDemoReply(customerMessage.content);
    }
  } catch (error) {
    logger.warn({ err: error, sessionId: String(session._id) }, 'AI không phản hồi, chuyển CSKH');
    const systemMessage = await switchToSupport(session, 'AI_ERROR');
    return { replies: [systemMessage], session, handoff: true };
  }

  const aiMessage = await createAiMessage(session, reply, {
    provider,
    model: provider === 'n8n' ? config.GEMINI_CHAT_MODEL : null,
    suggestedProducts,
  });

  const replies: ChatMessageDocument[] = [aiMessage];

  if (handoff) {
    const systemMessage = await switchToSupport(session, 'HANDOFF');
    replies.push(systemMessage);
    session.customerUnread += 1;
    await session.save();
  } else {
    session.customerUnread += 1;
    await touchSession(session, aiMessage);
  }

  return { replies, session, handoff };
}
