import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: !config.isProduction ? 'debug' : 'info',
  transport: !config.isProduction
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      }
    : undefined,
  redact: {
    paths: ['password', 'code', 'codeHash', 'passwordHash', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});
