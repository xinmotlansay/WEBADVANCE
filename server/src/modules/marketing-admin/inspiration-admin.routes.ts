import { Router, raw } from 'express';
import type { z } from 'zod';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import { reorderSchema } from './collection-admin.rules.js';
import { uploadAdminImage } from './collection-admin.service.js';
import {
  inspirationSchema,
  updateInspirationSchema,
  type InspirationInput,
  type UpdateInspirationInput,
} from './inspiration-admin.rules.js';
import {
  createInspiration,
  deleteInspiration,
  getInspiration,
  inspirationListQuerySchema,
  listInspirations,
  reorderInspirations,
  setInspirationHidden,
  updateInspiration,
  type InspirationListQuery,
} from './inspiration-admin.service.js';
import { checkPublishAt, publishAtBodySchema } from './schedule.service.js';

/** `/api/v1/admin/marketing/inspirations`: quyền đã kiểm ở router cha. */
export const inspirationAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);

inspirationAdminRoutes.get(
  '/',
  validateQuery(inspirationListQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listInspirations(res.locals['query'] as InspirationListQuery))),
);

// Đường dẫn cố định đứng trước `/:id`.
inspirationAdminRoutes.post(
  '/images',
  raw({ type: 'multipart/form-data', limit: '4mb' }),
  asyncHandler(async (req, res) => {
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('E-MKT-020-04', 400, 'Vui lòng chọn ảnh để tải lên.');
    res.status(201);
    sendData(res, await uploadAdminImage(new Uint8Array(await file.arrayBuffer()), 'inspirations'));
  }),
);

inspirationAdminRoutes.post(
  '/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (_req, res) =>
    sendData(res, await reorderInspirations(actor(res), (res.locals['body'] as z.infer<typeof reorderSchema>).ids)),
  ),
);

inspirationAdminRoutes.post(
  '/',
  validateBody(inspirationSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createInspiration(actor(res), res.locals['body'] as InspirationInput));
  }),
);

inspirationAdminRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await getInspiration(id(req.params)))),
);

inspirationAdminRoutes.patch(
  '/:id',
  validateBody(updateInspirationSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updateInspiration(actor(res), id(req.params), res.locals['body'] as UpdateInspirationInput)),
  ),
);

inspirationAdminRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await deleteInspiration(actor(res), id(req.params)))),
);

inspirationAdminRoutes.post(
  '/:id/hide',
  asyncHandler(async (req, res) => sendData(res, await setInspirationHidden(actor(res), id(req.params), true))),
);
inspirationAdminRoutes.post(
  '/:id/show',
  validateBody(publishAtBodySchema),
  asyncHandler(async (req, res) => {
    const { publishAt } = res.locals['body'] as { publishAt?: string };
    sendData(res, await setInspirationHidden(actor(res), id(req.params), false, checkPublishAt(publishAt)));
  }),
);
