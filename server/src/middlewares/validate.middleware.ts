import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) { next(new AppError('VALIDATION_ERROR', 400, 'Dữ liệu không hợp lệ', result.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })))); return; }
    res.locals['body'] = result.data; next();
  };
}

/** Kiểm tra `req.query`, kết quả đã parse nằm ở `res.locals['query']`. */
export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
      next(new AppError('VALIDATION_ERROR', 400, 'Dữ liệu không hợp lệ', details));
      return;
    }
    res.locals['query'] = result.data;
    next();
  };
}
