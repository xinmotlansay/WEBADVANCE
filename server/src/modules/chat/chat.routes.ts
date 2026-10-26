import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  listMessagesHandler,
  listSessionsHandler,
  markReadHandler,
  openSessionHandler,
  requestHandoffHandler,
  sendMessageHandler,
} from './chat.controller.js';
import {
  chatMessagesQuerySchema,
  chatSendMessageSchema,
  chatSessionListQuerySchema,
  chatSessionParamsSchema,
} from './chat.schema.js';

export const chatRouter = Router();

chatRouter.use(requireAuth);

chatRouter.post('/sessions', openSessionHandler);

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
