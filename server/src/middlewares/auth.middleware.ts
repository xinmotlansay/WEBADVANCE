import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../config/index.js';
import { UserStatus, type RoleName } from '../lib/shared-enums.js';
import { UserModel, type IRole } from '../modules/auth/auth.model.js';
import { AppError } from '../utils/app-error.js';

export interface AuthenticatedUser {
  id: string;
  roleName: RoleName;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  role: RoleName;
  mustChangePassword: boolean;
}

interface AccessClaims {
  sub: string;
  exp?: number;
}

/** Kiểm tra access token JWT (HS256) bằng `JWT_SECRET`. Trả `null` nếu token sai hoặc hết hạn. */
export function verifyAccessToken(token: string): AccessClaims | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature || !config.jwtSecret) return null;

  const expected = createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
    if (!claims.sub) return null;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function bearerClaims(authorization: string | undefined): AccessClaims | null {
  const header = authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyAccessToken(token) : null;
}

/**
 * Route bắt buộc đăng nhập: kiểm tra access token, rồi đọc tài khoản trong DB để chặn tài khoản bị
 * khóa, đã ẩn danh hóa hoặc phải đổi mật khẩu. Gán `req.user` và `res.locals['userId']` (string).
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('UNAUTHORIZED', 401, 'Bạn chưa đăng nhập');

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED', 401, 'Phiên đăng nhập đã hết hạn');
    }
    throw new AppError('UNAUTHORIZED', 401, 'Token không hợp lệ');
  }

  const user = await UserModel.findById(payload.sub).populate<{ roleId: IRole }>('roleId', 'name');
  if (!user) throw new AppError('UNAUTHORIZED', 401, 'Tài khoản không tồn tại');
  if (user.status === UserStatus.LOCKED) {
    throw new AppError(
      'ACCOUNT_LOCKED_BY_ADMIN',
      403,
      user.lockInfo?.reason || 'Tài khoản đã bị khóa bởi quản trị viên',
    );
  }
  if (user.status === UserStatus.ANONYMIZED) {
    throw new AppError('UNAUTHORIZED', 401, 'Tài khoản đã bị xóa');
  }
  // `req.path` trong router con chỉ là `/change-password`, nên so theo URL gốc.
  if (
    user.security.mustChangePassword &&
    !req.originalUrl.split('?')[0]!.endsWith('/auth/change-password')
  ) {
    throw new AppError('MUST_CHANGE_PASSWORD', 403, 'Bạn phải đổi mật khẩu trước khi tiếp tục');
  }

  req.user = {
    id: String(user._id),
    roleName: user.roleId?.name as RoleName,
    mustChangePassword: user.security.mustChangePassword,
  };
  res.locals['userId'] = req.user.id;
  next();
};

/**
 * Quyền `U`: gán `res.locals['userId']` (ObjectId) từ `sub` của access token. Không có token hợp lệ
 * thì 401 để client refresh hoặc chuyển tới đăng nhập.
 */
export const requireUser: RequestHandler = (req, res, next) => {
  const sub = bearerClaims(req.headers.authorization)?.sub;
  if (!sub || !Types.ObjectId.isValid(sub)) {
    next(new AppError('UNAUTHORIZED', 401, 'Bạn cần đăng nhập'));
    return;
  }
  res.locals['userId'] = new Types.ObjectId(sub);
  next();
};

/**
 * Chỉ cho phép Origin thuộc danh sách cấu hình hoặc chính server này (chống CSRF cho endpoint dùng
 * cookie). Server tự phục vụ FE (cổng 3000, ngrok…) nên request cùng origin luôn hợp lệ.
 */
export const checkOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (origin && !sameOrigin && !config.allowedOrigins.includes(origin)) {
    throw new AppError('FORBIDDEN', 403, 'Origin không được phép');
  }
  next();
};

export function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
