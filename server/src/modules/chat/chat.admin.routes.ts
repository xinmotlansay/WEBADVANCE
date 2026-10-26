import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import {
  adminClaimHandler,
  adminCloseHandler,
  adminListMessagesHandler,
  adminListSessionsHandler,
  adminSendMessageHandler,
} from './chat.controller.js';
import {
  chatAdminSessionListQuerySchema,
  chatMessagesQuerySchema,
  chatSendMessageSchema,
  chatSessionParamsSchema,
} from './chat.schema.js';

export const chatAdminRouter = Router();

chatAdminRouter.use(requireAuth, requireRole(RoleName.SUPER_ADMIN, RoleName.ORDER_ADMIN));

chatAdminRouter.get(
  '/sessions',
  validate({ query: chatAdminSessionListQuerySchema }),
  adminListSessionsHandler,
);

chatAdminRouter.get(
  '/sessions/:id/messages',
  validate({ params: chatSessionParamsSchema, query: chatMessagesQuerySchema }),
  adminListMessagesHandler,
);

chatAdminRouter.post(
  '/sessions/:id/claim',
  validate({ params: chatSessionParamsSchema }),
  adminClaimHandler,
);

chatAdminRouter.post(
  '/sessions/:id/messages',
  validate({ params: chatSessionParamsSchema, body: chatSendMessageSchema }),
  adminSendMessageHandler,
);

chatAdminRouter.post(
  '/sessions/:id/close',
  validate({ params: chatSessionParamsSchema }),
  adminCloseHandler,
);
