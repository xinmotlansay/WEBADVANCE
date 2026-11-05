import { Router, raw } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import {
  POSITIONS,
  createBannerSchema,
  duplicateSchema,
  idsSchema,
  reorderSchema,
  updateBannerSchema,
  type CreateBannerInput,
  type UpdateBannerInput,
} from './banner-admin.rules.js';
import {
  createBanner,
  deleteBanners,
  duplicateBanner,
  getBanner,
  listBanners,
  listQuerySchema,
  reorderBanners,
  setHidden,
  updateBanner,
  uploadBannerImage,
  type ListQuery,
} from './banner-admin.service.js';

/** `/api/v1/admin/marketing/banners`: quyền đã kiểm ở router cha. */
export const bannerAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);

bannerAdminRoutes.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listBanners(res.locals['query'] as ListQuery))),
);

const imageQuery = z.object({ position: z.enum(POSITIONS), kind: z.enum(['desktop', 'mobile']) });

// Các đường dẫn cố định phải đứng trước `/:id`.
bannerAdminRoutes.post(
  '/images',
  validateQuery(imageQuery),
  raw({ type: 'multipart/form-data', limit: '3mb' }),
  asyncHandler(async (req, res) => {
    const q = res.locals['query'] as z.infer<typeof imageQuery>;
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('E-MKT-012-01', 400, 'Vui lòng chọn ảnh để tải lên.');
    res.status(201);
    sendData(res, await uploadBannerImage(new Uint8Array(await file.arrayBuffer()), q.position, q.kind));
  }),
);

bannerAdminRoutes.post(
  '/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (_req, res) => {
    const b = res.locals['body'] as z.infer<typeof reorderSchema>;
    sendData(res, await reorderBanners(actor(res), b.position, b.ids));
  }),
);

bannerAdminRoutes.post(
  '/delete',
  validateBody(idsSchema),
  asyncHandler(async (_req, res) =>
    sendData(res, await deleteBanners(actor(res), (res.locals['body'] as { ids: string[] }).ids)),
  ),
);

bannerAdminRoutes.post(
  '/',
  validateBody(createBannerSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createBanner(actor(res), res.locals['body'] as CreateBannerInput));
  }),
);

bannerAdminRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => sendData(res, await getBanner(id(req.params)))),
);

bannerAdminRoutes.patch(
  '/:id',
  validateBody(updateBannerSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updateBanner(actor(res), id(req.params), res.locals['body'] as UpdateBannerInput)),
  ),
);

bannerAdminRoutes.post(
  '/:id/hide',
  asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), true))),
);
bannerAdminRoutes.post(
  '/:id/show',
  asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), false))),
);
bannerAdminRoutes.post(
  '/:id/duplicate',
  validateBody(duplicateSchema),
  asyncHandler(async (req, res) => {
    res.status(201);
    const body = res.locals['body'] as z.infer<typeof duplicateSchema>;
    sendData(res, await duplicateBanner(actor(res), id(req.params), body.position));
  }),
);
