import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { AppError } from '../../lib/app-error.js';
import { RoleName, UserStatus } from '../../lib/shared-enums.js';
import { AuthSessionModel, UserModel, type IRole } from './auth.model.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

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

function setRefreshCookie(res: Response, rawToken: string, ttlSeconds: number): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: ttlSeconds * 1000,
  });
}

/**
 * Cấp access token + refresh token. Refresh token chỉ lưu bản băm trong collection `authsessions`,
 * gửi cho trình duyệt qua cookie httpOnly (docs/architecture.md mục 5.3).
 */
export async function issueSession(
  user: { id: string; roleName: RoleName; mustChangePassword: boolean },
  res: Response,
): Promise<string> {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const ttlSeconds = isAdminRole(user.roleName)
    ? config.adminRefreshTtlSeconds
    : config.customerRefreshTtlSeconds;

  await AuthSessionModel.create({
    tokenHash: hashToken(rawToken),
    userId: user.id,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });

  setRefreshCookie(res, rawToken, ttlSeconds);
  return signAccessToken(user);
}

export function readRefreshToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME] ?? null;
}

/**
 * Xoay vòng refresh token: token cũ bị xóa ngay khi dùng (chống replay; `findOneAndDelete` nguyên
 * tử nên hai request dùng cùng token chỉ một cái thành công). Trả kèm tài khoản để client khôi phục
 * phiên trong một request, không phải gọi thêm `/auth/me`.
 */
export async function rotateSession(rawToken: string, res: Response) {
  const session = await AuthSessionModel.findOneAndDelete({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    throw new AppError(
      'SESSION_EXPIRED',
      401,
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    );
  }

  const user = await UserModel.findById(session.userId).populate<{ roleId: IRole }>(
    'roleId',
    'name',
  );
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản không tồn tại');
  }
  if (user.status === UserStatus.LOCKED) {
    throw new AppError(
      'ACCOUNT_LOCKED_BY_ADMIN',
      403,
      user.lockInfo?.reason || 'Tài khoản đã bị khóa',
    );
  }
  if (user.status === UserStatus.ANONYMIZED) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản đã bị xóa');
  }

  const accessToken = await issueSession(
    {
      id: String(user._id),
      roleName: user.roleId.name as RoleName,
      mustChangePassword: user.security.mustChangePassword,
    },
    res,
  );
  return { accessToken, user };
}

export async function revokeSession(rawToken: string, res: Response): Promise<void> {
  await AuthSessionModel.deleteOne({ tokenHash: hashToken(rawToken) });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

/** Thu hồi mọi phiên của người dùng (dùng khi đổi/quên mật khẩu). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await AuthSessionModel.deleteMany({ userId });
}
