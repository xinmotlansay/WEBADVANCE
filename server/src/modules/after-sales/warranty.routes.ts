import { Router } from 'express';
import { requireCustomer } from '../../middlewares/auth.middleware.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { toObjectId } from '../../utils/object-id.js';
import type { UserDoc } from '../auth/auth.model.js';
import { WarrantyRequestModel } from './after-sales.model.js';
import { afterSalesQuerySchema, warrantySchema } from './after-sales.schema.js';
import { createWarranty, warrantyCards, warrantyRequestDto } from './warranty.service.js';
import type { z } from 'zod';
export const warrantyRoutes = Router();
warrantyRoutes.use(['/warranty-cards', '/warranty-requests'], requireCustomer);
warrantyRoutes.get(
  '/warranty-cards',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    sendData(res, await warrantyCards((res.locals['user'] as UserDoc)._id, query.q, query.status));
  }),
);
warrantyRoutes.get(
  '/warranty-requests',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    const filter = {
      userId: (res.locals['user'] as UserDoc)._id,
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      WarrantyRequestModel.find(filter)
        .sort({ requestedAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      WarrantyRequestModel.countDocuments(filter),
    ]);
    sendPage(res, await Promise.all(rows.map(warrantyRequestDto)), {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  }),
);
warrantyRoutes.post(
  '/warranty-requests',
  validateBody(warrantySchema),
  asyncHandler(async (_req, res) => {
    const request = await createWarranty(
      (res.locals['user'] as UserDoc)._id,
      res.locals['body'] as z.infer<typeof warrantySchema>,
    );
    res.status(201);
    sendData(res, { id: request._id.toString(), status: request.status });
  }),
);
warrantyRoutes.get(
  '/warranty-requests/:id',
  asyncHandler(async (req, res) => {
    const request = await WarrantyRequestModel.findOne({
      _id: toObjectId(String(req.params['id'])),
      userId: (res.locals['user'] as UserDoc)._id,
    }).lean();
    if (!request) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy yêu cầu');
    sendData(res, await warrantyRequestDto(request));
  }),
);
