import { Router } from 'express';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  dashboardQuerySchema,
  getDashboard,
  getEffectiveness,
  type DashboardQuery,
} from './dashboard.service.js';

/** `/api/v1/admin/marketing/dashboard`: quyền đã kiểm ở router cha. Chỉ số liệu tổng hợp, không có thông tin khách. */
export const dashboardRoutes = Router();

dashboardRoutes.get(
  '/',
  validateQuery(dashboardQuerySchema),
  asyncHandler(async (_req, res) =>
    sendData(res, await getDashboard(res.locals['query'] as DashboardQuery)),
  ),
);

dashboardRoutes.get(
  '/effectiveness',
  validateQuery(dashboardQuerySchema),
  asyncHandler(async (_req, res) =>
    sendData(res, await getEffectiveness(res.locals['query'] as DashboardQuery)),
  ),
);
