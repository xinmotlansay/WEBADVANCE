import { Router } from 'express';
import { config } from '../../config/index.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  listMessagesHandler,
  listSessionsHandler,
  markReadHandler,
  openSessionHandler,
  publicAiAskHandler,
  requestHandoffHandler,
  sendMessageHandler,
} from './chat.controller.js';
import {
  chatAiAskSchema,
  chatMessagesQuerySchema,
  chatOpenSessionSchema,
  chatSendMessageSchema,
  chatSessionListQuerySchema,
  chatSessionParamsSchema,
} from './chat.schema.js';

export const chatRouter = Router();

chatRouter.post(
  '/ai/ask',
  validate({ body: chatAiAskSchema }),
  rateLimit({
    prefix: 'chat:ai:public',
    limit: config.CHAT_AI_RATE_LIMIT,
    windowSeconds: config.CHAT_AI_RATE_WINDOW_SECONDS,
    keyFn: (req) => req.ip ?? 'unknown',
    message: 'Bạn hỏi hơi nhanh, vui lòng chờ một chút rồi thử lại',
  }),
  publicAiAskHandler,
);

chatRouter.use(requireAuth);

chatRouter.post(
  '/sessions',
  validate({ body: chatOpenSessionSchema }),
  openSessionHandler,
);

chatRouter.get(
  '/sessions',
  validate({ query: chatSessionListQuerySchema }),
  listSessionsHandler,
);

chatRouter.get(
  '/sessions/:id/messages',
  validate({ params: chatSessionParamsSchema, query: chatMessagesQuerySchema }),
  listMessagesHandler,
);

chatRouter.post(
  '/sessions/:id/messages',
  validate({ params: chatSessionParamsSchema, body: chatSendMessageSchema }),
  rateLimit({
    prefix: 'chat:send',
    limit: 30,
    windowSeconds: 60,
    keyFn: (req) => req.user?.id ?? req.ip ?? 'unknown',
    message: 'Bạn gửi tin nhắn quá nhanh, vui lòng chờ một chút',
  }),
  sendMessageHandler,
);

chatRouter.post(
  '/sessions/:id/handoff',
  validate({ params: chatSessionParamsSchema }),
  requestHandoffHandler,
);

chatRouter.post(
  '/sessions/:id/read',
  validate({ params: chatSessionParamsSchema }),
  markReadHandler,
);
