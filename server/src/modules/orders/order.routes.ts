import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData, sendPage } from '../../utils/response.js';
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
import { listOrders } from './order-history.js';
import { createReview } from '../reviews/review.service.js';
import type { OrderStatus } from './order.model.js';

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
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query['limit']) || 10));
    const status = String(req.query['status'] ?? '')
      .split(',')
      .filter(Boolean) as OrderStatus[];
    const { items, total } = await listOrders(userId(res), { status, page, limit });
    sendPage(res, items, { page, limit, total, totalPages: Math.ceil(total / limit) });
  }),
);

/** FR-13: viết đánh giá cho một dòng hàng của đơn đã giao. */
orderRoutes.post(
  '/:orderId/items/:orderItemId/reviews',
  asyncHandler(async (req, res) => {
    const body = req.body as { rating: number; comment?: string; images?: string[] };
    res.status(201);
    sendData(
      res,
      await createReview(
        userId(res),
        toObjectId(String(req.params['orderId'])),
        toObjectId(String(req.params['orderItemId'])),
        body,
      ),
    );
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
