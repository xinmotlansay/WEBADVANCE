import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../../middlewares/auth.middleware.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { toObjectId } from '../../utils/object-id.js';
import type { UserDoc } from '../auth/auth.model.js';
import { OrderModel, ReturnRequestModel } from './after-sales.model.js';
import { afterSalesQuerySchema, returnSchema } from './after-sales.schema.js';
import { createReturn, eligibleOrder, returnRequestDto } from './return.service.js';
export const returnRoutes = Router();
returnRoutes.use(['/orders', '/return-requests'], requireCustomer);
returnRoutes.get(
  '/orders',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    const filter = {
      userId: (res.locals['user'] as UserDoc)._id,
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      OrderModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      OrderModel.countDocuments(filter),
    ]);
    sendPage(
      res,
      rows.map((o) => ({
        id: o._id.toString(),
        orderCode: o.orderCode,
        status: o.status,
        createdAt: o.createdAt,
        totalAmount: o.totalAmount,
      })),
      { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    );
  }),
);
returnRoutes.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await OrderModel.findOne({
      _id: toObjectId(String(req.params['id'])),
      userId: (res.locals['user'] as UserDoc)._id,
    }).lean();
    if (!order) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy đơn');
    sendData(res, await eligibleOrder(order));
  }),
);
returnRoutes.get(
  '/return-requests',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    const filter = {
      userId: (res.locals['user'] as UserDoc)._id,
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      ReturnRequestModel.find(filter)
        .select('+refundAccount.accountNumber')
        .sort({ requestedAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      ReturnRequestModel.countDocuments(filter),
    ]);
    sendPage(res, await Promise.all(rows.map(returnRequestDto)), {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  }),
);
returnRoutes.get(
  '/return-requests/:id',
  asyncHandler(async (req, res) => {
    const request = await ReturnRequestModel.findOne({
      _id: toObjectId(String(req.params['id'])),
      userId: (res.locals['user'] as UserDoc)._id,
    })
      .select('+refundAccount.accountNumber')
      .lean();
    if (!request) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy yêu cầu');
    sendData(res, await returnRequestDto(request));
  }),
);
returnRoutes.post(
  '/return-requests',
  validateBody(returnSchema),
  asyncHandler(async (_req, res) => {
    const result = await createReturn(
      (res.locals['user'] as UserDoc)._id,
      res.locals['body'] as z.infer<typeof returnSchema>,
    );
    res.status(201);
    sendData(res, result);
  }),
);
returnRoutes.post(
  '/return-requests/:id/cancel',
  asyncHandler(async (req, res) => {
    const request = await ReturnRequestModel.findOneAndUpdate(
      {
        _id: toObjectId(String(req.params['id'])),
        userId: (res.locals['user'] as UserDoc)._id,
        status: 'PENDING',
      },
      {
        $set: { status: 'CANCELLED' },
        $push: { timeline: { status: 'CANCELLED', at: new Date() } },
      },
      { new: true },
    ).lean();
    if (!request) {
      const exists = await ReturnRequestModel.exists({
        _id: toObjectId(String(req.params['id'])),
        userId: (res.locals['user'] as UserDoc)._id,
      });
      throw new AppError(
        exists ? 'ORDER_INVALID_STATE' : 'NOT_FOUND',
        exists ? 409 : 404,
        exists ? 'Chỉ có thể hủy yêu cầu đang chờ xử lý' : 'Không tìm thấy yêu cầu',
      );
    }
    sendData(res, { id: request._id.toString(), status: request.status });
  }),
);
