import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { hitRateCounter } from '../../lib/rate-counter.js';
import { ChatMode, ChatSenderType, ChatSessionStatus } from '../../lib/shared-enums.js';
import { generateChatAnswer } from '../../integrations/gemini.js';
import {
  getChatCatalogSafe,
  getPublicChatCatalog,
  type ChatCatalog,
} from './chat-catalog.service.js';
import {
  findCatalogPriceProducts,
  selectCatalogSuggestionProducts,
} from './chat-catalog-answer.js';
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

/** Gợi ý câu hỏi tiếp theo cho khung chat AI công khai (không lưu DB). */
const PUBLIC_SUGGESTIONS = [
  'Sofa da phù hợp phòng 20m²?',
  'Chính sách đổi trả thế nào?',
  'Phí giao hàng tính ra sao?',
];

export interface AiReplyResult {
  replies: ChatMessageDocument[];
  session: ChatSessionDocument;
  handoff: boolean;
}

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

async function loadHistory(sessionId: string, excludedMessageId: string): Promise<HistoryItem[]> {
  const messages = await ChatMessageModel.find({
    sessionId,
    _id: { $ne: excludedMessageId },
    senderType: { $in: [ChatSenderType.CUSTOMER, ChatSenderType.AI] },
  })
    .sort({ sentAt: -1 })
    .limit(config.chatHistoryLimit)
    .lean();

  return messages.reverse().map((message) => ({
    role: message.senderType === ChatSenderType.AI ? 'assistant' : 'user',
    content: message.content,
  }));
}

async function isAiRateLimited(customerId: string): Promise<boolean> {
  try {
    const { count } = await hitRateCounter(
      `rl:chat:ai:${customerId}`,
      config.chatAiRateWindowSeconds,
    );
    return count > config.chatAiRateLimit;
  } catch (error) {
    // Không đếm được thì không nên chặn khách chat với AI.
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

async function switchToSupport(
  session: ChatSessionDocument,
  reason: string,
): Promise<ChatMessageDocument> {
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

async function touchSession(
  session: ChatSessionDocument,
  message: ChatMessageDocument,
): Promise<void> {
  session.lastMessageAt = message.sentAt;
  session.lastMessagePreview = buildMessagePreview(message.content);
  await session.save();
}

/**
 * Trả lời tin nhắn của khách bằng Gemini.
 * Tin nhắn của khách đã được lưu trước khi hàm này chạy.
 */
export async function respondWithAi(
  session: ChatSessionDocument,
  customerMessage: ChatMessageDocument,
): Promise<AiReplyResult> {
  const customerId = String(session.customerId);

  if (await isAiRateLimited(customerId)) {
    const systemMessage = await switchToSupport(session, 'RATE_LIMIT');
    return { replies: [systemMessage], session, handoff: true };
  }

  const history = await loadHistory(String(session._id), String(customerMessage._id));
  let answer: Awaited<ReturnType<typeof generateChatAnswer>>;

  try {
    answer = await generateChatAnswer({
      message: customerMessage.content,
      history,
      loadContext: async (query) => {
        const catalog = await getChatCatalogSafe();
        const relevantProducts = findCatalogPriceProducts(query, catalog);
        return {
          ...catalog,
          products: relevantProducts ?? catalog.products,
          policies: POLICIES,
        };
      },
    });
  } catch (error) {
    logger.warn({ err: error, sessionId: String(session._id) }, 'AI không phản hồi, chuyển CSKH');
    const systemMessage = await switchToSupport(session, 'AI_ERROR');
    return { replies: [systemMessage], session, handoff: true };
  }

  const aiMessage = await createAiMessage(session, answer.text, {
    provider: 'gemini',
    model: answer.model,
    suggestedProducts: answer.productSlugs,
  });

  session.customerUnread += 1;
  await touchSession(session, aiMessage);

  return { replies: [aiMessage], session, handoff: false };
}

export interface PublicAiAnswer {
  reply: string;
  suggestions: string[];
  products: ReturnType<typeof selectCatalogSuggestionProducts>;
  provider: 'gemini';
}

/**
 * Trả lời AI cho khung chat công khai trên trang chủ.
 * Không tạo phiên, không ghi tin nhắn vào MongoDB; lịch sử do client gửi lên.
 */
export async function askPublicAi(
  message: string,
  history: HistoryItem[],
): Promise<PublicAiAnswer> {
  let catalog: ChatCatalog = { products: [], showrooms: [], collections: [] };

  const answer = await generateChatAnswer({
    message,
    history,
    loadContext: async (query) => {
      catalog = await getPublicChatCatalog();
      const relevantProducts = findCatalogPriceProducts(query, catalog);
      return {
        ...catalog,
        products: relevantProducts ?? catalog.products,
        policies: POLICIES,
      };
    },
  });

  return {
    reply: answer.text,
    suggestions: PUBLIC_SUGGESTIONS,
    products: selectCatalogSuggestionProducts(catalog, answer.productSlugs),
    provider: 'gemini',
  };
}
