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

/**
 * API Order Admin. Mỗi router có requireAuth + requireRole ở cấp router nên chỉ cho đi qua đúng các đường
 * dẫn của nó; nếu không, chúng chặn cả /admin/auth/login và API của Product Admin.
 * `/orders/bulk-confirm` là của adminRouter (Product Admin) nên bỏ ra.
 */
const orderAdminApi = express.Router();
orderAdminApi.use(
  orderAdminRouter,
  paymentAdminRouter,
  returnAdminRouter,
  warrantyAdminRouter,
  customerAdminRouter,
  dashboardAdminRouter,
  adminUploadRouter,
);
const ORDER_ADMIN_PATH =
  /^\/(customers|dashboard\/orders|late-compensation-requests|orders|payments|reports\/orders|return-requests|warranty-requests|uploads\/refund-proofs)(\/|$)/;
app.use('/api/v1/admin', (req, res, next) => {
  if (req.path === '/orders/bulk-confirm' || !ORDER_ADMIN_PATH.test(req.path)) return next();
  orderAdminApi(req, res, next);
});
app.use('/api/v1', apiRoutes);
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
