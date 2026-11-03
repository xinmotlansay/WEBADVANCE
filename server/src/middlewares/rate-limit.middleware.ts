import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';
import { hitRateCounter } from '../lib/rate-counter.js';

export interface RateLimitOptions {
  prefix: string;
  limit: number;
  windowSeconds: number;
  message?: string;
  keyFn?: (req: Request) => string;
  /** Bỏ qua giới hạn khi không đếm được. Chỉ nên bật cho endpoint không nhạy cảm. */
  failOpen?: boolean;
}

/** Giới hạn tần suất lưu trong MongoDB để nhiều tiến trình dùng chung (NF-16). */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const scope = options.keyFn ? options.keyFn(req) : (req.ip ?? 'unknown');
    let hit;
    try {
      hit = await hitRateCounter(`rl:${options.prefix}:${scope}`, options.windowSeconds);
    } catch (error) {
      if (options.failOpen) return next();
      throw error;
    }

    if (hit.count > options.limit) {
      res.setHeader('Retry-After', String(hit.retryAfterSeconds));
      throw new AppError(
        'TOO_MANY_REQUESTS',
        429,
        options.message ??
          `Bạn thao tác quá nhanh, vui lòng thử lại sau ${hit.retryAfterSeconds} giây`,
        { retryAfterSeconds: hit.retryAfterSeconds },
      );
    }

    next();
  };
}
