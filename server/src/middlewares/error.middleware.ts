import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.js';

/** Lỗi trùng khóa unique của MongoDB (code 11000) đổi sang mã lỗi nghiệp vụ theo field bị trùng. */
const DUPLICATE_KEY_MESSAGES: Record<string, { code: string; message: string }> = {
  email: { code: 'EMAIL_EXISTS', message: 'Email này đã được sử dụng' },
  phoneNumber: { code: 'PHONE_EXISTS', message: 'Số điện thoại này đã được sử dụng' },
  googleId: { code: 'GOOGLE_EMAIL_EXISTS', message: 'Tài khoản Google này đã được liên kết' },
};

function isDuplicateKeyError(
  error: unknown,
): error is { code: number; keyPattern: Record<string, unknown> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000 &&
    typeof (error as { keyPattern?: unknown }).keyPattern === 'object'
  );
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, 'Không tìm thấy tài nguyên'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: err.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })),
      },
    });
    return;
  }
  if (isDuplicateKeyError(err)) {
    const mapped = DUPLICATE_KEY_MESSAGES[Object.keys(err.keyPattern)[0] ?? ''];
    res.status(409).json({
      success: false,
      error: mapped ?? { code: 'CONFLICT', message: 'Dữ liệu đã tồn tại' },
    });
    return;
  }
  // Body không phải JSON hợp lệ (express.json).
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Body không phải JSON hợp lệ' },
    });
    return;
  }

  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File vượt quá dung lượng cho phép' },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res
      .status(400)
      .json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'JSON không hợp lệ' } });
    return;
  }

  console.warn('Lỗi không xác định:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' },
  });
};
