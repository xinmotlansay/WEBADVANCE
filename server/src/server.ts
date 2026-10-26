import express from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { createServer } from 'node:http';
import path from 'node:path';
import { config } from './config/index.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { chatAdminRouter } from './modules/chat/chat.admin.routes.js';
import { initSocket } from './socket/index.js';

const app = express();
const httpServer = createServer(app);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.COOKIE_SECRET));
app.use(pinoHttp({ logger }));

app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/admin/chat', chatAdminRouter);

app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/admin', express.static(path.resolve('dist/admin-web/browser')));
app.use(express.static(path.resolve('dist/customer-web/browser')));

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap(): Promise<void> {
  await connectDb();
  initSocket(httpServer);

  httpServer.listen(config.PORT, () => {
    logger.info(`API đang chạy ở cổng ${config.PORT}`);
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Không thể khởi động server');
  process.exit(1);
});
