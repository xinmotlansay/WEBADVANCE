import { Router } from 'express';
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
import { setPasswordHandler } from '../super-admin/super-admin.controller.js';
import { setPasswordSchema } from '../super-admin/super-admin.schema.js';

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
  }),
  adminLoginHandler,
);

adminAuthRouter.post('/refresh', checkOrigin, adminRefreshHandler);
adminAuthRouter.post('/logout', checkOrigin, adminLogoutHandler);
adminAuthRouter.get('/me', requireAuth, requireAdminRole, adminMeHandler);

// AD-11: Admin mới đặt mật khẩu bằng liên kết trong email.
adminAuthRouter.post(
  '/set-password',
  checkOrigin,
  validate({ body: setPasswordSchema }),
  rateLimit({ prefix: 'admin:set-password', limit: 10, windowSeconds: 15 * 60, keyFn: (req) => req.ip ?? 'unknown' }),
  setPasswordHandler,
);
