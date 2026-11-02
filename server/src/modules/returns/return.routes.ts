import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import {
  completeReturnHandler,
  confirmReturnHandler,
  getReturnHandler,
  listReturnsHandler,
  receiveReturnHandler,
  refundReturnHandler,
  rejectReturnHandler,
  updateReturnHandler,
} from './return.controller.js';
import {
  receiveReturnSchema,
  refundReturnSchema,
  rejectReturnSchema,
  returnIdParamsSchema,
  returnListQuerySchema,
  updateReturnSchema,
} from './return.schema.js';

export const returnAdminRouter = Router();
returnAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));
returnAdminRouter.get('/return-requests', validate({ query: returnListQuerySchema }), listReturnsHandler);
returnAdminRouter.get('/return-requests/:id', validate({ params: returnIdParamsSchema }), getReturnHandler);
returnAdminRouter.post('/return-requests/:id/confirm', validate({ params: returnIdParamsSchema }), confirmReturnHandler);
returnAdminRouter.post('/return-requests/:id/reject', validate({ params: returnIdParamsSchema, body: rejectReturnSchema }), rejectReturnHandler);
returnAdminRouter.patch('/return-requests/:id', validate({ params: returnIdParamsSchema, body: updateReturnSchema }), updateReturnHandler);
returnAdminRouter.post('/return-requests/:id/receive', validate({ params: returnIdParamsSchema, body: receiveReturnSchema }), receiveReturnHandler);
returnAdminRouter.post('/return-requests/:id/refund', validate({ params: returnIdParamsSchema, body: refundReturnSchema }), refundReturnHandler);
returnAdminRouter.post('/return-requests/:id/complete', validate({ params: returnIdParamsSchema }), completeReturnHandler);
