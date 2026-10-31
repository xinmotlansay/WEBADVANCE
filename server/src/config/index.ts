import 'dotenv/config';

export const config = {
  embeddingUrl: process.env['EMBEDDING_URL'] ?? '',
  embeddingModel: process.env['EMBEDDING_MODEL'] ?? 'clip',
  vectorIndex: process.env['VECTOR_SEARCH_INDEX'] ?? 'product_image_vector',
  port: Number(process.env['PORT'] ?? 3000),
  mongodbUri: process.env['MONGODB_URI'] ?? '',
  redisUrl: process.env['REDIS_URL'] ?? '',
  jwtSecret: (process.env['JWT_SECRET'] ?? '').trim(),
  cookieSecret: process.env['COOKIE_SECRET'] ?? '',
  resendApiKey: process.env['RESEND_API_KEY'] ?? '',
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  /** Chat AI: model chính, model dự phòng, thời gian chờ và giới hạn tần suất cho khách công khai. */
  geminiChatModel: process.env['GEMINI_CHAT_MODEL'] ?? 'gemini-3.1-flash-lite',
  geminiChatFallbackModel: process.env['GEMINI_CHAT_FALLBACK_MODEL'] ?? 'gemini-flash-lite-latest',
  chatAiTimeoutMs: Number(process.env['CHAT_AI_TIMEOUT_MS'] ?? 45000),
  chatAiRateLimit: Number(process.env['CHAT_AI_RATE_LIMIT'] ?? 20),
  chatAiRateWindowSeconds: Number(process.env['CHAT_AI_RATE_WINDOW_SECONDS'] ?? 60),
  chatHistoryLimit: Number(process.env['CHAT_HISTORY_LIMIT'] ?? 20),
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  bankWebhookSecret: process.env['BANK_WEBHOOK_SECRET'] ?? '',
  isProduction: process.env['NODE_ENV'] === 'production',
  /** Khách chưa gửi token: request được coi là của user này (chỉ ngoài production). */
  devUserId: process.env['DEV_USER_ID'] || '000000000000000000000001',
  otpEmailFrom: process.env['OTP_EMAIL_FROM'] ?? 'CaraVeso <onboarding@resend.dev>',
  /** Origin được gọi các endpoint dùng cookie (refresh, logout). */
  allowedOrigins: (
    process.env['ALLOWED_ORIGINS'] ??
    // README chạy dev bằng `--host 127.0.0.1`, nên cho phép cả hai dạng host.
    'http://localhost:4200,http://localhost:4201,http://127.0.0.1:4200,http://127.0.0.1:4201'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  firebaseProjectId: process.env['FIREBASE_PROJECT_ID'],
  firebaseClientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
  firebasePrivateKey: process.env['FIREBASE_PRIVATE_KEY'],
  googleApplicationCredentials: process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  accessTokenTtl: '15m' as const,
  customerRefreshTtlSeconds: 7 * 24 * 60 * 60,
  adminRefreshTtlSeconds: 30 * 60,
};
