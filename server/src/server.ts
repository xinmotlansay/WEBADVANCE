import { createServer } from 'node:http';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config/index.js';
import { connectDatabase, isDatabaseConnected } from './config/database.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { orderAdminRouter } from './modules/orders/order-admin.routes.js';
import { paymentAdminRouter } from './modules/payments/payment.routes.js';
import { returnAdminRouter } from './modules/returns/return.routes.js';
import { warrantyAdminRouter } from './modules/warranty/warranty.routes.js';
import { customerAdminRouter } from './modules/customers/customer.routes.js';
import { dashboardAdminRouter } from './modules/dashboard/dashboard.routes.js';
import { adminUploadRouter } from './modules/uploads/admin-upload.routes.js';
import { apiRoutes } from './modules/routes.js';
import { initSocket } from './socket/index.js';

const app = express();
const httpServer = createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.cookieSecret));

app.get('/api/v1/health', (_req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', database: isDatabaseConnected() ? 'connected' : 'disconnected' },
  });
});

// Phải mount apiRoutes TRƯỚC các router admin: các router admin đều mở đầu bằng
// `router.use(requireAuth, requireRole(...))` nên nếu mount trước, mọi request /api/v1/admin/*
// (kể cả /api/v1/admin/auth/login) sẽ bị chặn 401 "Bạn chưa đăng nhập".
app.use('/api/v1', apiRoutes);
app.use('/api/v1/admin', orderAdminRouter);
app.use('/api/v1/admin', paymentAdminRouter);
app.use('/api/v1/admin', returnAdminRouter);
app.use('/api/v1/admin', warrantyAdminRouter);
app.use('/api/v1/admin', customerAdminRouter);
app.use('/api/v1/admin', dashboardAdminRouter);
app.use('/api/v1/admin', adminUploadRouter);
app.use('/api', notFoundHandler);

app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/admin', express.static(path.resolve('dist/admin-web/browser')));
app.get(/^\/admin(?:\/.*)?$/, (_req, res, next) => {
  res.sendFile(path.resolve('dist/admin-web/browser/index.html'), (error) => {
    if (error) next(error);
  });
});
app.use(express.static(path.resolve('dist/customer-web/browser')));

// Angular owns client routes; direct links and reloads must reach its router.
app.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)|admin(?:\/|$)).*/, (req, res, next) => {
  if (path.extname(req.path)) {
    next();
    return;
  }
  res.sendFile(path.resolve('dist/customer-web/browser/index.html'));
});

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDatabase();

  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.warn(`API đang chạy ở cổng ${config.port}`);
  });
}

start().catch((err: unknown) => {
  console.warn('Không khởi động được API:', err);
  process.exit(1);
});
