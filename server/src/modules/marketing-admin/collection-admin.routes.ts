import { Router } from 'express';
import type { z } from 'zod';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import {
  createCollectionSchema,
  reorderSchema,
  updateCollectionSchema,
  type CreateCollectionInput,
  type UpdateCollectionInput,
} from './collection-admin.rules.js';
import {
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  listQuerySchema,
  reorderCollections,
  setHidden,
  updateCollection,
  type ListQuery,
} from './collection-admin.service.js';

/** `/api/v1/admin/marketing/collections`: quyền đã kiểm ở router cha. */
export const collectionAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);

collectionAdminRoutes.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listCollections(res.locals['query'] as ListQuery))),
);

// Đường dẫn cố định đứng trước `/:id`.
collectionAdminRoutes.post(
  '/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (_req, res) =>
    sendData(res, await reorderCollections(actor(res), (res.locals['body'] as z.infer<typeof reorderSchema>).ids)),
  ),
);

collectionAdminRoutes.post(
  '/',
  validateBody(createCollectionSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createCollection(actor(res), res.locals['body'] as CreateCollectionInput));
  }),
);

collectionAdminRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await getCollection(id(req.params)))),
);

collectionAdminRoutes.patch(
  '/:id',
  validateBody(updateCollectionSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updateCollection(actor(res), id(req.params), res.locals['body'] as UpdateCollectionInput)),
  ),
);

collectionAdminRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await deleteCollection(actor(res), id(req.params)))),
);

collectionAdminRoutes.post(
  '/:id/hide',
  asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), true))),
);
collectionAdminRoutes.post(
  '/:id/show',
  asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), false))),
);
