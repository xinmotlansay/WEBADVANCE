import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import { getCustomerHandler, listCustomersHandler } from './customer.controller.js';
import { customerIdParamsSchema, customerListQuerySchema } from './customer.schema.js';

export const customerAdminRouter = Router();
customerAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));
customerAdminRouter.get('/customers', validate({ query: customerListQuerySchema }), listCustomersHandler);
customerAdminRouter.get('/customers/:id', validate({ params: customerIdParamsSchema }), getCustomerHandler);
