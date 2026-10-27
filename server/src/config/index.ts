import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'Thiếu MONGODB_URI'),
  REDIS_URL: z.string().min(1, 'Thiếu REDIS_URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài tối thiểu 32 ký tự'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET phải dài tối thiểu 16 ký tự'),
  RESEND_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  BANK_WEBHOOK_SECRET: z.string().optional(),
  OTP_EMAIL_FROM: z.string().default('CaraVeso <onboarding@resend.dev>'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:4200,http://localhost:4201'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GEMINI_CHAT_FALLBACK_MODEL: z.string().default('gemini-flash-lite-latest'),
  CHAT_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  CHAT_AI_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  CHAT_AI_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  CHAT_HISTORY_LIMIT: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  console.error('Cấu hình môi trường không hợp lệ:\n- ' + details.join('\n- '));
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  isDev: env.NODE_ENV !== 'production',
  allowedOrigins: env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  accessTokenTtl: '15m',
  customerRefreshTtlSeconds: 7 * 24 * 60 * 60,
  adminRefreshTtlSeconds: 30 * 60,
} as const;
