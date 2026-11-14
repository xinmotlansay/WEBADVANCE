import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../middlewares/auth.middleware.js';

export const AI_GUEST_COOKIE = 'cv_guest_id';
const GUEST_ID_PATTERN = /^[\w-]{1,64}$/;
const GUEST_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** Chủ sở hữu hội thoại AI: tài khoản đăng nhập hoặc mã khách vãng lai trong cookie. */
export interface AiOwner {
  userId: Types.ObjectId | null;
  guestId: string | null;
}

/**
 * Đọc access token nếu có nhưng không bắt buộc đăng nhập.
 * Chỉ cần token hợp lệ (chữ ký + hạn) là đủ để gắn hội thoại vào tài khoản.
 */
export const optionalAiUser: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const sub = token ? verifyAccessToken(token)?.sub : undefined;
  if (sub && Types.ObjectId.isValid(sub)) {
    res.locals['aiUserId'] = new Types.ObjectId(sub);
  }
  next();
};

/** Lấy (hoặc cấp mới) mã khách vãng lai để lưu hội thoại qua nhiều tab/thiết bị. */
export function resolveAiOwner(req: Request, res: Response): AiOwner {
  const userId = res.locals['aiUserId'];
  if (userId instanceof Types.ObjectId) {
    return { userId, guestId: null };
  }

  const existing: unknown = req.cookies?.[AI_GUEST_COOKIE];
  if (typeof existing === 'string' && GUEST_ID_PATTERN.test(existing)) {
    return { userId: null, guestId: existing };
  }

  const guestId = randomUUID();
  res.cookie(AI_GUEST_COOKIE, guestId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
    path: '/',
  });
  return { userId: null, guestId };
}

/** Điều kiện truy vấn chỉ trả hội thoại thuộc đúng chủ sở hữu. */
export function aiOwnerFilter(owner: AiOwner): Record<string, unknown> {
  if (owner.userId) return { userId: owner.userId };
  return { userId: null, guestId: owner.guestId };
}
