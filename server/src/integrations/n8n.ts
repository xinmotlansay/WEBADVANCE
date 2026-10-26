import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export interface ChatWorkflowProduct {
  name: string;
  price?: number;
  material?: string;
  color?: string;
  dimensions?: string;
  stockStatus?: string;
}

export interface ChatWorkflowRequest {
  sessionId: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  customer: { id: string; fullName: string };
  context: {
    products: ChatWorkflowProduct[];
    policies: Record<string, string>;
  };
}

export interface ChatWorkflowResponse {
  sessionId?: string;
  reply: string;
  handoff: boolean;
  suggestedProducts: string[];
  error: string | null;
}

export function isChatWorkflowConfigured(): boolean {
  return Boolean(config.N8N_CHAT_WEBHOOK_URL);
}

/**
 * Gọi workflow n8n đã import từ docs/integrations/n8n-chat-workflow.json.
 * Trả `null` khi chưa cấu hình URL để tầng trên dùng chế độ demo.
 */
export async function callChatWorkflow(payload: ChatWorkflowRequest): Promise<ChatWorkflowResponse | null> {
  const url = config.N8N_CHAT_WEBHOOK_URL;
  if (!url) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.CHAT_AI_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.N8N_WEBHOOK_SECRET ? { 'x-webhook-secret': config.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`n8n trả về HTTP ${response.status}`);
    }

    const data = (await response.json()) as Partial<ChatWorkflowResponse>;
    if (typeof data.reply !== 'string' || !data.reply.trim()) {
      throw new Error('n8n trả về thiếu nội dung trả lời');
    }

    return {
      sessionId: data.sessionId,
      reply: data.reply.trim(),
      handoff: Boolean(data.handoff),
      suggestedProducts: Array.isArray(data.suggestedProducts)
        ? data.suggestedProducts.filter((name): name is string => typeof name === 'string').slice(0, 3)
        : [],
      error: typeof data.error === 'string' ? data.error : null,
    };
  } catch (error) {
    logger.error({ err: error, sessionId: payload.sessionId }, 'Gọi workflow n8n thất bại');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
