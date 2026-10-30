import 'dotenv/config';

export const config = {
  port: Number(process.env['PORT'] ?? 3000),
  mongodbUri: process.env['MONGODB_URI'] ?? '',
  redisUrl: process.env['REDIS_URL'] ?? '',
  jwtSecret: process.env['JWT_SECRET'] ?? '',
  cookieSecret: process.env['COOKIE_SECRET'] ?? '',
  resendApiKey: process.env['RESEND_API_KEY'] ?? '',
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  bankWebhookSecret: process.env['BANK_WEBHOOK_SECRET'] ?? '',
  isProduction: process.env['NODE_ENV'] === 'production',
  /** Chưa có đăng nhập: mọi request của khách được coi là của user này (chỉ ngoài production). */
  devUserId: process.env['DEV_USER_ID'] || '000000000000000000000001',
};
