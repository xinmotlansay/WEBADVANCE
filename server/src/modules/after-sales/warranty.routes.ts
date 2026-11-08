import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { toObjectId } from '../../utils/object-id.js';
import { currentUserId } from './current-user.js';
import { WarrantyRequestModel } from './after-sales.model.js';
import { afterSalesQuerySchema, warrantySchema } from './after-sales.schema.js';
import { createWarranty, warrantyCards, warrantyRequestDto } from './warranty.service.js';
import type { z } from 'zod';
export const warrantyRoutes = Router();
warrantyRoutes.use(['/warranty-cards', '/warranty-requests'], requireAuth);
warrantyRoutes.get(
  '/warranty-cards',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    sendData(res, await warrantyCards(currentUserId(res), query.q, query.status));
  }),
);
warrantyRoutes.get(
  '/warranty-requests',
  validateQuery(afterSalesQuerySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof afterSalesQuerySchema>;
    const filter = {
      userId: currentUserId(res),
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
      currentUserId(res),
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
      userId: currentUserId(res),
    }).lean();
    if (!request) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy yêu cầu');
    sendData(res, await warrantyRequestDto(request));
  }),
);
