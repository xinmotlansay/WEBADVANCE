import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import {
  createOrderSchema,
  idempotencyKeySchema,
  type CreateOrderBody,
} from '../checkout/checkout.schema.js';
import {
  cancelOrderSchema,
  rescheduleSchema,
  type CancelOrderBody,
  type RescheduleBody,
} from './order.schema.js';
import {
  cancelByCustomer,
  createOrder,
  getOrderDetail,
  getOrderPayment,
  rescheduleDelivery,
} from './order.service.js';

export const orderRoutes = Router();

orderRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;

orderRoutes.post(
  '/',
  validateBody(createOrderSchema),
  asyncHandler(async (req, res) => {
    const key = idempotencyKeySchema.safeParse(req.get('Idempotency-Key'));
    if (!key.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Thiếu header Idempotency-Key');
    }
    const body = res.locals['body'] as CreateOrderBody;
    const { created, view } = await createOrder(userId(res), key.data, body);
    res.status(created ? 201 : 200);
    sendData(res, view);
  }),
);

orderRoutes.get(
  '/:orderId',
  asyncHandler(async (req, res) => {
    sendData(res, await getOrderDetail(userId(res), toObjectId(String(req.params['orderId']))));
  }),
);

orderRoutes.get(
  '/:orderId/payment',
  asyncHandler(async (req, res) => {
    sendData(res, await getOrderPayment(userId(res), toObjectId(String(req.params['orderId']))));
  }),
);

orderRoutes.post(
  '/:orderId/cancel',
  validateBody(cancelOrderSchema),
  asyncHandler(async (req, res) => {
    const orderId = toObjectId(String(req.params['orderId']));
    sendData(
      res,
      await cancelByCustomer(userId(res), orderId, res.locals['body'] as CancelOrderBody),
    );
  }),
);

orderRoutes.patch(
  '/:orderId/delivery-schedule',
  validateBody(rescheduleSchema),
  asyncHandler(async (req, res) => {
    const orderId = toObjectId(String(req.params['orderId']));
    sendData(
      res,
      await rescheduleDelivery(userId(res), orderId, res.locals['body'] as RescheduleBody),
    );
  }),
);
