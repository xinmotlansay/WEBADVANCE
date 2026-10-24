import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { requireCustomer } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';
import { sendData } from '../../utils/response.js';
import { login, refresh, hashToken } from './auth.service.js';
import { AuthSessionModel, type UserDoc } from './auth.model.js';
const COOKIE = 'caraveso_refresh';
function refreshCookie(req: Request): string {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + '='));
  return cookie?.slice(COOKIE.length + 1) ?? '';
}
function setCookie(req: Request, res: Response, value: string): void {
  res.cookie(COOKIE, value, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 30 * 86400000,
  });
}
function checkOrigin(req: Request): void {
  if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`)
    throw new AppError('FORBIDDEN', 403, 'Nguồn yêu cầu không hợp lệ');
}
export const authRoutes = Router();
authRoutes.post(
  '/login',
  validateBody(
    z.object({
      identifier: z.string().trim().min(1).max(254),
      password: z.string().min(1).max(128),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = res.locals['body'] as { identifier: string; password: string };
    const result = await login(body.identifier, body.password);
    setCookie(req, res, result.refreshToken);
    sendData(res, result.data);
  }),
);
authRoutes.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    checkOrigin(req);
    const result = await refresh(refreshCookie(req));
    setCookie(req, res, result.refreshToken);
    sendData(res, result.data);
  }),
);
authRoutes.post(
  '/logout',
  asyncHandler(async (req, res) => {
    checkOrigin(req);
    const cookie = refreshCookie(req);
    if (cookie)
      await AuthSessionModel.deleteOne({ _id: cookie.split('.')[0], tokenHash: hashToken(cookie) });
    res.clearCookie(COOKIE, {
      path: '/api/v1/auth',
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
    });
    sendData(res, { loggedOut: true });
  }),
);
authRoutes.get('/me', requireCustomer, (_req, res) => {
  const user = res.locals['user'] as UserDoc;
  sendData(res, {
    id: user._id.toString(),
    fullName: user.profile.fullName,
    email: user.email,
    roleName: 'CUSTOMER',
    mustChangePassword: false,
  });
});
