import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import {
  completeRefundHandler,
  listPaymentExceptionsHandler,
  listPendingRefundsHandler,
  startRefundHandler,
  listPaymentsHandler,
  resolvePaymentHandler,
} from './payment.controller.js';
import {
  completeRefundSchema,
  paymentListQuerySchema,
  startRefundSchema,
  resolvePaymentSchema,
  transactionIdParamsSchema,
} from './payment.schema.js';

export const paymentAdminRouter = Router();

paymentAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));

paymentAdminRouter.get(
  '/payments',
  validate({ query: paymentListQuerySchema }),
  listPaymentsHandler,
);

paymentAdminRouter.get('/payments/exceptions', listPaymentExceptionsHandler);

paymentAdminRouter.get('/payments/refunds/pending', listPendingRefundsHandler);

paymentAdminRouter.post(
  '/payments/:transactionId/refund/start',
  validate({ params: transactionIdParamsSchema, body: startRefundSchema }),
  startRefundHandler,
);

paymentAdminRouter.post(
  '/payments/:transactionId/refund',
  validate({ params: transactionIdParamsSchema, body: completeRefundSchema }),
  completeRefundHandler,
);

paymentAdminRouter.post(
  '/payments/:transactionId/resolve',
  validate({ params: transactionIdParamsSchema, body: resolvePaymentSchema }),
  resolvePaymentHandler,
);
