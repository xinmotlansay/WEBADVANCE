import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

function validate(source: 'query' | 'body', schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
      next(new AppError('VALIDATION_ERROR', 400, 'Dữ liệu không hợp lệ', details));
      return;
    }
    res.locals[source] = result.data;
    next();
  };
}

/** Kiểm tra `req.query`, kết quả đã parse nằm ở `res.locals['query']`. */
export const validateQuery = (schema: ZodType): RequestHandler => validate('query', schema);

/** Kiểm tra `req.body`, kết quả đã parse nằm ở `res.locals['body']`. */
export const validateBody = (schema: ZodType): RequestHandler => validate('body', schema);
