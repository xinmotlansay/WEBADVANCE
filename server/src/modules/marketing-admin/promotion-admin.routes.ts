import { Router } from 'express';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import {
  createPromotionSchema,
  endSchema,
  reasonSchema,
  updatePromotionSchema,
  type PauseReason,
} from './promotion-admin.rules.js';
import {
  createPromotion,
  deactivatePromotion,
  deletePromotion,
  duplicatePromotion,
  endPromotions,
  getPromotion,
  listPromotions,
  listQuerySchema,
  pausePromotion,
  previewPromotion,
  resumePromotion,
  updatePromotion,
  type ListQuery,
} from './promotion-admin.service.js';

/** `/api/v1/admin/marketing/promotions`: quyền đã kiểm ở router cha. */
export const promotionAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);
type Reason = { reason: PauseReason; note?: string };

promotionAdminRoutes.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => {
    const { data, meta } = await listPromotions(res.locals['query'] as ListQuery);
    sendPage(res, data, meta);
  }),
);

promotionAdminRoutes.post(
  '/',
  validateBody(createPromotionSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createPromotion(actor(res), res.locals['body']));
  }),
);

// Các đường dẫn tĩnh phải đứng trước `/:id`.
promotionAdminRoutes.post(
  '/preview',
  asyncHandler(async (req, res) => sendData(res, await previewPromotion(req.body ?? {}))),
);

promotionAdminRoutes.post(
  '/end',
  validateBody(endSchema),
  asyncHandler(async (_req, res) => {
    const b = res.locals['body'] as Reason & { ids: string[] };
    sendData(res, await endPromotions(actor(res), b.ids, b.reason, b.note));
  }),
);

promotionAdminRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await getPromotion(id(req.params)))),
);

promotionAdminRoutes.patch(
  '/:id',
  validateBody(updatePromotionSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updatePromotion(actor(res), id(req.params), res.locals['body'])),
  ),
);

promotionAdminRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) =>
    sendData(res, await deletePromotion(actor(res), id(req.params))),
  ),
);

promotionAdminRoutes.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    res.status(201);
    sendData(res, await duplicatePromotion(actor(res), id(req.params)));
  }),
);

promotionAdminRoutes.post(
  '/:id/deactivate',
  asyncHandler(async (req, res) =>
    sendData(res, await deactivatePromotion(actor(res), id(req.params))),
  ),
);

promotionAdminRoutes.post(
  '/:id/pause',
  validateBody(reasonSchema),
  asyncHandler(async (req, res) => {
    const b = res.locals['body'] as Reason;
    sendData(res, await pausePromotion(actor(res), id(req.params), b.reason, b.note));
  }),
);

promotionAdminRoutes.post(
  '/:id/resume',
  asyncHandler(async (req, res) =>
    sendData(res, await resumePromotion(actor(res), id(req.params))),
  ),
);
