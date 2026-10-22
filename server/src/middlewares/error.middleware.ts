import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

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
  // Body không phải JSON hợp lệ (express.json).
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Body không phải JSON hợp lệ' },
    });
    return;
  }

  console.warn('Lỗi không xác định:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' },
  });
};
