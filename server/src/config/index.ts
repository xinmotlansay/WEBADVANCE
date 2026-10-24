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
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  bankWebhookSecret: process.env['BANK_WEBHOOK_SECRET'] ?? '',
};
