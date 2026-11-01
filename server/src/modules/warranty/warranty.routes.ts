import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import {
  acceptWarrantyHandler,
  getWarrantyHandler,
  listWarrantiesHandler,
  rejectWarrantyHandler,
  updateWarrantyStatusHandler,
} from './warranty.controller.js';
import {
  rejectWarrantySchema,
  updateWarrantyStatusSchema,
  warrantyIdParamsSchema,
  warrantyListQuerySchema,
} from './warranty.schema.js';

export const warrantyAdminRouter = Router();
warrantyAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));
warrantyAdminRouter.get('/warranty-requests', validate({ query: warrantyListQuerySchema }), listWarrantiesHandler);
warrantyAdminRouter.get('/warranty-requests/:id', validate({ params: warrantyIdParamsSchema }), getWarrantyHandler);
warrantyAdminRouter.post('/warranty-requests/:id/accept', validate({ params: warrantyIdParamsSchema }), acceptWarrantyHandler);
warrantyAdminRouter.post('/warranty-requests/:id/reject', validate({ params: warrantyIdParamsSchema, body: rejectWarrantySchema }), rejectWarrantyHandler);
warrantyAdminRouter.patch('/warranty-requests/:id/status', validate({ params: warrantyIdParamsSchema, body: updateWarrantyStatusSchema }), updateWarrantyStatusHandler);
