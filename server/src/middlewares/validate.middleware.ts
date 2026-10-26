import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/app-error.js';

export type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/**
 * Kiểm tra dữ liệu đầu vào bằng Zod, thay body/params bằng dữ liệu đã parse.
 * Query được gắn vào res.locals vì Express 5 không cho gán đè req.query.
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
      res.locals.query = schemas.query.parse(req.query);
    }
    next();
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
