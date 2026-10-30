import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { config } from '../config/index.js';
import { AppError } from '../utils/app-error.js';

/**
 * Quyền `U`: gán `res.locals['userId']` (ObjectId) cho route cần khách đăng nhập.
 * ponytail: chưa có đăng nhập (FR-02) nên dùng user cố định `DEV_USER_ID`, chặn hẳn ở production.
 * Khi có JWT chỉ cần thay thân hàm này, các route giữ nguyên `requireUser`.
 */
export const requireUser: RequestHandler = (_req, res, next) => {
  if (config.isProduction || !Types.ObjectId.isValid(config.devUserId)) {
    next(new AppError('UNAUTHORIZED', 401, 'Bạn cần đăng nhập'));
    return;
  }
  res.locals['userId'] = new Types.ObjectId(config.devUserId);
  next();
};
