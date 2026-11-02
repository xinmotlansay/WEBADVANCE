import { Router } from 'express';
import { config } from '../../config/index.js';
import { checkOrigin, requireAuth } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  adminLoginHandler,
  adminLogoutHandler,
  adminMeHandler,
  adminRefreshHandler,
  requireAdminRole,
} from './admin-auth.controller.js';
import { adminLoginSchema } from './auth.schema.js';

export const adminAuthRouter = Router();

adminAuthRouter.post(
  '/login',
  checkOrigin,
  validate({ body: adminLoginSchema }),
  rateLimit({
    prefix: 'admin:login',
    limit: 20,
    windowSeconds: 15 * 60,
    keyFn: (req) => `${(req.body as { identifier?: string }).identifier ?? 'unknown'}:${req.ip}`,
    // Ở môi trường dev máy chưa bật Redis vẫn phải đăng nhập được; production vẫn fail-closed.
    failOpen: !config.isProduction,
  }),
  adminLoginHandler,
);

adminAuthRouter.post('/refresh', checkOrigin, adminRefreshHandler);
adminAuthRouter.post('/logout', checkOrigin, adminLogoutHandler);
adminAuthRouter.get('/me', requireAuth, requireAdminRole, adminMeHandler);
