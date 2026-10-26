import type { Request, RequestHandler } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

export interface RateLimitOptions {
  prefix: string;
  limit: number;
  windowSeconds: number;
  message?: string;
  keyFn?: (req: Request) => string;
  /** Cho phép bỏ qua giới hạn khi Redis lỗi. Chỉ nên bật cho endpoint không nhạy cảm. */
  failOpen?: boolean;
}

/** Giới hạn tần suất dùng Redis để nhiều tiến trình dùng chung (NF-16). */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const scope = options.keyFn ? options.keyFn(req) : (req.ip ?? 'unknown');
    const key = `rl:${options.prefix}:${scope}`;

    let count: number;
    try {
      count = await withTimeout(redis.incr(key), 800);
      if (count === 1) {
        await withTimeout(redis.expire(key, options.windowSeconds), 800);
      }
    } catch (error) {
      // Môi trường dev có thể không chạy Redis: không chặn luồng phát triển.
      if (options.failOpen || config.isDev) {
        logger.warn({ err: error, prefix: options.prefix }, 'Redis không khả dụng, bỏ qua giới hạn tần suất');
        return next();
      }
      throw error;
    }

    if (count > options.limit) {
      const ttl = await withTimeout(redis.ttl(key), 800).catch(() => -1);
      const retryAfter = ttl > 0 ? ttl : options.windowSeconds;
      res.setHeader('Retry-After', String(retryAfter));
      throw new AppError(
        'TOO_MANY_REQUESTS',
        429,
        options.message ?? `Bạn thao tác quá nhanh, vui lòng thử lại sau ${retryAfter} giây`,
        { retryAfterSeconds: retryAfter },
      );
    }

    next();
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
