import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RoleName } from '../../lib/shared-enums.js';
import {
  approveLateCompensationHandler,
  cancelOrderHandler,
  confirmOrderHandler,
  finalizeReturnHandler,
  getOrderHandler,
  getOrderPaymentHandler,
  listLateCompensationsHandler,
  listOrdersHandler,
  markDeliveredHandler,
  markDeliveryFailedHandler,
  redeliverHandler,
  rejectLateCompensationHandler,
  returnToWarehouseHandler,
  updateOrderStatusHandler,
  updateShipmentHandler,
} from './order.controller.js';
import {
  cancelOrderSchema,
  compensationIdParamsSchema,
  deliveryFailedSchema,
  finalizeReturnSchema,
  lateCompensationQuerySchema,
  orderIdParamsSchema,
  orderListQuerySchema,
  rejectCompensationSchema,
  updateOrderStatusSchema,
  updateShipmentSchema,
} from './order-admin.schema.js';

export const orderAdminRouter = Router();

orderAdminRouter.use(requireAuth, requireRole(RoleName.ORDER_ADMIN, RoleName.SUPER_ADMIN));

/* ----------------------------- Đơn hàng ----------------------------- */

orderAdminRouter.get('/orders', validate({ query: orderListQuerySchema }), listOrdersHandler);

orderAdminRouter.get('/orders/:id', validate({ params: orderIdParamsSchema }), getOrderHandler);

orderAdminRouter.post(
  '/orders/:id/confirm',
  validate({ params: orderIdParamsSchema }),
  confirmOrderHandler,
);

orderAdminRouter.patch(
  '/orders/:id/status',
  validate({ params: orderIdParamsSchema, body: updateOrderStatusSchema }),
  updateOrderStatusHandler,
);

orderAdminRouter.post(
  '/orders/:id/cancel',
  validate({ params: orderIdParamsSchema, body: cancelOrderSchema }),
  cancelOrderHandler,
);

orderAdminRouter.get(
  '/orders/:id/payment',
  validate({ params: orderIdParamsSchema }),
  getOrderPaymentHandler,
);

orderAdminRouter.put(
  '/orders/:id/shipment',
  validate({ params: orderIdParamsSchema, body: updateShipmentSchema }),
  updateShipmentHandler,
);

orderAdminRouter.post(
  '/orders/:id/shipment/delivered',
  validate({ params: orderIdParamsSchema }),
  markDeliveredHandler,
);

orderAdminRouter.post(
  '/orders/:id/delivery-failed',
  validate({ params: orderIdParamsSchema, body: deliveryFailedSchema }),
  markDeliveryFailedHandler,
);

orderAdminRouter.post(
  '/orders/:id/redeliver',
  validate({ params: orderIdParamsSchema }),
  redeliverHandler,
);

orderAdminRouter.post(
  '/orders/:id/return-to-warehouse',
  validate({ params: orderIdParamsSchema }),
  returnToWarehouseHandler,
);

orderAdminRouter.post(
  '/orders/:id/finalize-return',
  validate({ params: orderIdParamsSchema, body: finalizeReturnSchema }),
  finalizeReturnHandler,
);

/* ------------------------ Voucher bù giao trễ ------------------------ */

orderAdminRouter.get(
  '/late-compensation-requests',
  validate({ query: lateCompensationQuerySchema }),
  listLateCompensationsHandler,
);

orderAdminRouter.post(
  '/late-compensation-requests/:id/approve',
  validate({ params: compensationIdParamsSchema }),
  approveLateCompensationHandler,
);

orderAdminRouter.post(
  '/late-compensation-requests/:id/reject',
  validate({ params: compensationIdParamsSchema, body: rejectCompensationSchema }),
  rejectLateCompensationHandler,
);
