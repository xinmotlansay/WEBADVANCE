import { Router } from 'express';
import { config } from '../../config/index.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  deleteAiConversationHandler,
  getAiConversationHandler,
  listAiConversationsHandler,
  listMessagesHandler,
  listSessionsHandler,
  markReadHandler,
  mergeAiConversationsHandler,
  openSessionHandler,
  publicAiAskHandler,
  renameAiConversationHandler,
  requestHandoffHandler,
  sendMessageHandler,
} from './chat.controller.js';
import { optionalAiUser } from './chat-ai-owner.js';
import {
  chatAiAskSchema,
  chatAiConversationParamsSchema,
  chatAiConversationRenameSchema,
  chatMessagesQuerySchema,
  chatOpenSessionSchema,
  chatSendMessageSchema,
  chatSessionListQuerySchema,
  chatSessionParamsSchema,
} from './chat.schema.js';

export const chatRouter = Router();

chatRouter.post(
  '/ai/ask',
  optionalAiUser,
  validate({ body: chatAiAskSchema }),
  rateLimit({
    prefix: 'chat:ai:public',
    limit: config.chatAiRateLimit,
    windowSeconds: config.chatAiRateWindowSeconds,
    keyFn: (req) => req.ip ?? 'unknown',
    message: 'Bạn hỏi hơi nhanh, vui lòng chờ một chút rồi thử lại',
  }),
  publicAiAskHandler,
);

/* Lịch sử hội thoại AI: khách đăng nhập lưu theo tài khoản, khách vãng lai lưu theo cookie. */
chatRouter.get('/ai/conversations', optionalAiUser, listAiConversationsHandler);

chatRouter.get(
  '/ai/conversations/:id',
  optionalAiUser,
  validate({ params: chatAiConversationParamsSchema }),
  getAiConversationHandler,
);

chatRouter.patch(
  '/ai/conversations/:id',
  optionalAiUser,
  validate({
    params: chatAiConversationParamsSchema,
    body: chatAiConversationRenameSchema,
  }),
  renameAiConversationHandler,
);

chatRouter.delete(
  '/ai/conversations/:id',
  optionalAiUser,
  validate({ params: chatAiConversationParamsSchema }),
  deleteAiConversationHandler,
);

chatRouter.use(requireAuth);

/* Gộp hội thoại khách vãng lai vào tài khoản ngay sau khi đăng nhập. */
chatRouter.post('/ai/conversations/merge', mergeAiConversationsHandler);

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
