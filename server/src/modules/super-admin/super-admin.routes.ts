import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import * as c from './super-admin.controller.js';
import { jobSchema } from './job-admin.schema.js';
import { showroomSchema } from './showroom-admin.schema.js';
import {
  adminListQuerySchema,
  auditLogQuerySchema,
  changeRoleSchema,
  configKeyParamsSchema,
  createAdminSchema,
  deactivateSchema,
  idParamsSchema,
  overviewQuerySchema,
  updateAdminSchema,
  updateConfigSchema,
} from './super-admin.schema.js';

/**
 * API Design 11.5: chức năng riêng của Admin cấp cao (AD-02, AD-10 → AD-15). Gắn quyền theo từng route
 * (không `router.use`) vì router này mount ở `/admin`, dùng chung tiền tố với module của vai trò khác.
 */
export const superAdminRoutes = Router();

const sa = [requireAuth, requireRole(RoleName.SUPER_ADMIN)];

superAdminRoutes.get('/dashboard/overview', ...sa, validate({ query: overviewQuerySchema }), c.overviewHandler);

superAdminRoutes.get('/admins', ...sa, validate({ query: adminListQuerySchema }), c.listAdminsHandler);
superAdminRoutes.post('/admins', ...sa, validate({ body: createAdminSchema }), c.createAdminHandler);
superAdminRoutes.patch('/admins/:id', ...sa, validate({ params: idParamsSchema, body: updateAdminSchema }), c.updateAdminHandler);
superAdminRoutes.patch('/admins/:id/role', ...sa, validate({ params: idParamsSchema, body: changeRoleSchema }), c.changeRoleHandler);
superAdminRoutes.post('/admins/:id/deactivate', ...sa, validate({ params: idParamsSchema, body: deactivateSchema }), c.deactivateHandler);
superAdminRoutes.post('/admins/:id/activate', ...sa, validate({ params: idParamsSchema }), c.activateHandler);
superAdminRoutes.post('/admins/:id/resend-invite', ...sa, validate({ params: idParamsSchema }), c.resendInviteHandler);

superAdminRoutes.get('/roles', ...sa, c.listRolesHandler);

superAdminRoutes.get('/audit-logs', ...sa, validate({ query: auditLogQuerySchema }), c.auditLogsHandler);

superAdminRoutes.get('/system-configs', ...sa, c.listConfigsHandler);
superAdminRoutes.put('/system-configs/:key', ...sa, validate({ params: configKeyParamsSchema, body: updateConfigSchema }), c.updateConfigHandler);

superAdminRoutes.get('/showrooms', ...sa, c.listShowroomsHandler);
superAdminRoutes.post('/showrooms', ...sa, validate({ body: showroomSchema }), c.createShowroomHandler);
superAdminRoutes.put('/showrooms/:id', ...sa, validate({ params: idParamsSchema, body: showroomSchema }), c.updateShowroomHandler);
superAdminRoutes.delete('/showrooms/:id', ...sa, validate({ params: idParamsSchema }), c.deleteShowroomHandler);

superAdminRoutes.get('/jobs', ...sa, c.listJobsHandler);
superAdminRoutes.post('/jobs', ...sa, validate({ body: jobSchema }), c.createJobHandler);
superAdminRoutes.put('/jobs/:id', ...sa, validate({ params: idParamsSchema, body: jobSchema }), c.updateJobHandler);
superAdminRoutes.delete('/jobs/:id', ...sa, validate({ params: idParamsSchema }), c.deleteJobHandler);
