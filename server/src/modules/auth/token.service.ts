import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { AppError } from '../../lib/app-error.js';
import { redis } from '../../lib/redis.js';
import { RoleName, UserStatus } from '../../lib/shared-enums.js';
import { UserModel, type IRole } from './auth.model.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Admin dùng cookie riêng để phiên admin và phiên khách trên cùng host không ghi đè nhau. */
export const ADMIN_REFRESH_COOKIE_NAME = 'adminRefreshToken';
export const ADMIN_REFRESH_COOKIE_PATH = '/api/v1/admin/auth';

const SESSION_KEY_PREFIX = 'auth:refresh:';
const USER_SESSIONS_PREFIX = 'auth:sessions:';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function isAdminRole(roleName: RoleName): boolean {
  return roleName !== RoleName.CUSTOMER;
}

export function signAccessToken(user: {
  id: string;
  roleName: RoleName;
  mustChangePassword: boolean;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      role: user.roleName,
      mustChangePassword: user.mustChangePassword,
    },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl },
  );
}

function refreshCookie(admin: boolean): { name: string; path: string } {
  return admin
    ? { name: ADMIN_REFRESH_COOKIE_NAME, path: ADMIN_REFRESH_COOKIE_PATH }
    : { name: REFRESH_COOKIE_NAME, path: REFRESH_COOKIE_PATH };
}

function setRefreshCookie(res: Response, rawToken: string, ttlSeconds: number, admin: boolean): void {
  const { name, path } = refreshCookie(admin);
  res.cookie(name, rawToken, {
    httpOnly: true,
    secure: !!config.isProduction,
    sameSite: 'strict',
    path,
    maxAge: ttlSeconds * 1000,
  });
}

/**
 * Cấp access token + refresh token. Refresh token chỉ lưu bản băm trong Redis,
 * gửi cho trình duyệt qua cookie httpOnly (docs/architecture.md mục 5.3).
 */
export async function issueSession(
  user: { id: string; roleName: RoleName; mustChangePassword: boolean },
  res: Response,
): Promise<string> {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const ttlSeconds = isAdminRole(user.roleName)
    ? config.adminRefreshTtlSeconds
    : config.customerRefreshTtlSeconds;

  const sessionKey = `${SESSION_KEY_PREFIX}${tokenHash}`;
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${user.id}`;

  await redis
    .multi()
    .set(sessionKey, JSON.stringify({ userId: user.id }), 'EX', ttlSeconds)
    .sadd(userSessionsKey, tokenHash)
    .expire(userSessionsKey, config.customerRefreshTtlSeconds)
    .exec();

  setRefreshCookie(res, rawToken, ttlSeconds, isAdminRole(user.roleName));
  return signAccessToken(user);
}

export function readRefreshToken(req: Request, admin = false): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[refreshCookie(admin).name] ?? null;
}

/** Xoay vòng refresh token: token cũ bị thu hồi ngay khi dùng (chống replay). */
export async function rotateSession(
  rawToken: string,
  res: Response,
  options: { admin?: boolean } = {},
): Promise<string> {
  const tokenHash = hashToken(rawToken);
  const sessionKey = `${SESSION_KEY_PREFIX}${tokenHash}`;
  const stored = await redis.get(sessionKey);

  if (!stored) {
    throw new AppError('SESSION_EXPIRED', 401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  await redis.del(sessionKey);

  const { userId } = JSON.parse(stored) as { userId: string };
  await redis.srem(`${USER_SESSIONS_PREFIX}${userId}`, tokenHash);

  const user = await UserModel.findById(userId).populate<{ roleId: IRole }>('roleId', 'name');
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản không tồn tại');
  }
  if (options.admin && !isAdminRole(user.roleId.name as RoleName)) {
    throw new AppError('SESSION_EXPIRED', 401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }
  if (user.status === UserStatus.LOCKED) {
    throw new AppError('ACCOUNT_LOCKED_BY_ADMIN', 403, user.lockInfo?.reason || 'Tài khoản đã bị khóa');
  }
  if (user.status === UserStatus.ANONYMIZED) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản đã bị xóa');
  }

  return issueSession(
    {
      id: String(user._id),
      roleName: user.roleId.name as RoleName,
      mustChangePassword: user.security.mustChangePassword,
    },
    res,
  );
}

export async function revokeSession(
  rawToken: string,
  res: Response,
  options: { admin?: boolean } = {},
): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  const sessionKey = `${SESSION_KEY_PREFIX}${tokenHash}`;
  const stored = await redis.get(sessionKey);

  let userId: string | null = null;
  if (stored) {
    userId = (JSON.parse(stored) as { userId: string }).userId;
    await redis.srem(`${USER_SESSIONS_PREFIX}${userId}`, tokenHash);
  }

  await redis.del(sessionKey);
  const { name, path } = refreshCookie(options.admin ?? false);
  res.clearCookie(name, { path });
  return userId;
}

/** Người dùng còn phiên đăng nhập nào chưa hết hạn không (cùng tài khoản có thể đăng nhập ở nhiều trình duyệt). */
export async function hasActiveSessions(userId: string): Promise<boolean> {
  const hashes = await redis.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
  for (const hash of hashes) {
    if (await redis.exists(`${SESSION_KEY_PREFIX}${hash}`)) return true;
  }
  return false;
}

/** Thu hồi mọi phiên của người dùng (dùng khi đổi/quên mật khẩu). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;
  const hashes = await redis.smembers(userSessionsKey);

  if (hashes.length > 0) {
    await redis.del(...hashes.map((hash) => `${SESSION_KEY_PREFIX}${hash}`));
  }
  await redis.del(userSessionsKey);
}
