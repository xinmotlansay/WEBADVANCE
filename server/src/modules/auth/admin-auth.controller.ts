import type { RequestHandler } from 'express';
import { AppError } from '../../lib/app-error.js';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { ADMIN_ROLE_NAMES, type RoleName } from '../../lib/shared-enums.js';
import { closeAgentSessions } from '../chat/chat.service.js';
import type { AdminLoginBody } from './auth.schema.js';
import { getCurrentUser, login, type AuthUserDto } from './auth.service.js';
import { hasActiveSessions, readRefreshToken, revokeSession, rotateSession } from './token.service.js';

export const ADMIN_IDLE_TIMEOUT_SECONDS = config.adminRefreshTtlSeconds;

function success<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message ? { message } : {}) };
}

function adminSession(user: AuthUserDto) {
  return {
    user,
    role: user.roleName,
    mustChangePassword: user.mustChangePassword,
    sessionIdleTimeoutSeconds: ADMIN_IDLE_TIMEOUT_SECONDS,
  };
}

/** Route admin: tài khoản đã đăng nhập phải thuộc một trong 4 vai trò admin. */
export const requireAdminRole: RequestHandler = (req, _res, next) => {
  if (!req.user || !ADMIN_ROLE_NAMES.includes(req.user.roleName as RoleName)) {
    throw new AppError('FORBIDDEN', 403, 'Bạn không có quyền truy cập trang quản trị');
  }
  next();
};

export const adminLoginHandler: RequestHandler = async (req, res) => {
  const { identifier, password } = req.body as AdminLoginBody;
  const result = await login({ identifier, password }, res, { audience: 'admin' });
  res.status(200).json(
    success({ ...adminSession(result.user), accessToken: result.accessToken }, 'Đăng nhập thành công'),
  );
};

export const adminRefreshHandler: RequestHandler = async (req, res) => {
  const rawToken = readRefreshToken(req, true);
  if (!rawToken) {
    throw new AppError('SESSION_EXPIRED', 401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }
  const accessToken = await rotateSession(rawToken, res, { admin: true });
  res.status(200).json(success({ accessToken }));
};

export const adminLogoutHandler: RequestHandler = async (req, res) => {
  const rawToken = readRefreshToken(req, true);
  if (rawToken) {
    const userId = await revokeSession(rawToken, res, { admin: true });
    // Admin đăng xuất hẳn (không còn phiên đăng nhập nào): các phiên chat CSKH đang xử lý chuyển sang
    // "Đã đóng". Không để lỗi chat chặn đăng xuất.
    if (userId && !(await hasActiveSessions(userId))) {
      await closeAgentSessions(userId).catch((error: unknown) =>
        logger.warn({ err: error, userId }, 'Không đóng được phiên chat khi admin đăng xuất'),
      );
    }
  }
  res.status(200).json(success({ loggedOut: true }, 'Đã đăng xuất'));
};

export const adminMeHandler: RequestHandler = async (req, res) => {
  const user = await getCurrentUser(req.user!.id);
  res.status(200).json(success(adminSession(user)));
};
