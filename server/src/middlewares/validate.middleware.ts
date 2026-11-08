import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

function validateSource(source: 'query' | 'body', schema: ZodType): RequestHandler {
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
export const validateQuery = (schema: ZodType): RequestHandler => validateSource('query', schema);

/** Kiểm tra `req.body`, kết quả đã parse nằm ở `res.locals['body']`. */
export const validateBody = (schema: ZodType): RequestHandler => validateSource('body', schema);

export type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/**
 * Kiểm tra nhiều phần của request cùng lúc bằng Zod (dùng cho module auth): thay body/params bằng dữ
 * liệu đã parse, query gắn vào `res.locals` vì Express 5 không cho gán đè `req.query`. Lỗi Zod được
 * `errorHandler` đổi thành 400 `VALIDATION_ERROR`.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      res.locals['query'] = schemas.query.parse(req.query);
    }
    next();
  };
}
