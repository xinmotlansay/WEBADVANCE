import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import { getOrderDashboardHandler, getOrderReportHandler } from './dashboard.controller.js';
import { reportQuerySchema } from './dashboard.schema.js';

export const dashboardAdminRouter = Router();
dashboardAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));
dashboardAdminRouter.get('/dashboard/orders', getOrderDashboardHandler);
dashboardAdminRouter.get('/reports/orders', validate({ query: reportQuerySchema }), getOrderReportHandler);
