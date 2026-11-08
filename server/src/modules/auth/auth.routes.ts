import { Router, type RequestHandler } from 'express';
import { OtpPurpose } from '../../lib/shared-enums.js';
import { ACCOUNT_PURPOSES } from './otp.service.js';
import { checkOrigin, requireAuth } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
  sendOtpHandler,
  verifyOtpHandler,
  googleLinkHandler,
  googleLinkOtpHandler,
  googleLoginHandler,
  changePasswordHandler,
} from './auth.controller.js';
import {
  loginSchema,
  otpSendSchema,
  otpVerifySchema,
  registerSchema,
  resetPasswordSchema,
  googleLoginSchema,
  googleLinkOtpSchema,
  googleLinkSchema,
  changePasswordSchema,
} from './auth.schema.js';

export const authRouter = Router();

/** `CHANGE_CONTACT` và `DELETE_ACCOUNT` cần đăng nhập; các mục đích còn lại là công khai. */
const requireAuthForAccountOtp: RequestHandler = (req, res, next) =>
  ACCOUNT_PURPOSES.includes((req.body as { purpose?: OtpPurpose }).purpose as OtpPurpose)
    ? requireAuth(req, res, next)
    : next();

authRouter.post(
  '/otp/send',
  validate({ body: otpSendSchema }),
  requireAuthForAccountOtp,
  rateLimit({
    prefix: 'otp:send',
    limit: 20,
    windowSeconds: 60 * 60,
    keyFn: (req) => `${(req.body as { target?: string }).target ?? 'unknown'}:${req.ip}`,
  }),
  sendOtpHandler,
);

authRouter.post(
  '/otp/verify',
  validate({ body: otpVerifySchema }),
  rateLimit({ prefix: 'otp:verify', limit: 30, windowSeconds: 15 * 60 }),
  verifyOtpHandler,
);

authRouter.post(
  '/register',
  validate({ body: registerSchema }),
  rateLimit({ prefix: 'auth:register', limit: 10, windowSeconds: 60 * 60 }),
  registerHandler,
);

authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  rateLimit({ prefix: 'auth:login', limit: 20, windowSeconds: 15 * 60 }),
  loginHandler,
);

authRouter.post(
  '/google',
  validate({ body: googleLoginSchema }),
  rateLimit({ prefix: 'auth:google', limit: 30, windowSeconds: 15 * 60 }),
  googleLoginHandler,
);

authRouter.post(
  '/google/link/otp',
  validate({ body: googleLinkOtpSchema }),
  rateLimit({ prefix: 'auth:google-link-otp', limit: 10, windowSeconds: 15 * 60 }),
  googleLinkOtpHandler,
);

authRouter.post(
  '/google/link',
  validate({ body: googleLinkSchema }),
  rateLimit({ prefix: 'auth:google-link', limit: 20, windowSeconds: 15 * 60 }),
  googleLinkHandler,
);

authRouter.post('/refresh', checkOrigin, refreshHandler);
authRouter.post('/logout', checkOrigin, logoutHandler);
authRouter.get('/me', requireAuth, meHandler);

authRouter.post(
  '/forgot-password/reset',
  validate({ body: resetPasswordSchema }),
  rateLimit({ prefix: 'auth:reset-password', limit: 10, windowSeconds: 60 * 60 }),
  resetPasswordHandler,
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  rateLimit({ prefix: 'auth:change-password', limit: 10, windowSeconds: 60 * 60 }),
  changePasswordHandler,
);
