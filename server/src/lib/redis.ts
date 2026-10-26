import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  commandTimeout: 2000,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Đã kết nối Redis'));
redis.on('error', (error) => logger.error({ err: error }, 'Lỗi kết nối Redis'));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
