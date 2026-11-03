import { Router, raw } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import { createLandingSchema, landingMetaSchema, lpKey, saveSchema, type SaveInput } from './content-admin.rules.js';
import {
  createLandingPage,
  getContent,
  listLandingPages,
  listVersions,
  restoreVersion,
  saveContent,
  setLandingHidden,
  uploadContentImage,
} from './content-admin.service.js';

/** `/api/v1/admin/marketing/content`: quyền đã kiểm ở router cha. */
export const contentAdminRoutes = Router();

const keySchema = z.enum(['HOME', 'ANNOUNCEMENT_BAR']);
const key = (p: { key?: string | string[] }) => keySchema.parse(String(p.key));
const slug = (p: { slug?: string | string[] }) => String(p.slug);
const actor = (res: { locals: Record<string, unknown> }) => String(res.locals['userId']);
const restoreSchema = z.object({ version: z.number().int().min(0) });
const vid = (p: { id?: string | string[] }) => Number(p.id);

contentAdminRoutes.post(
  '/images',
  raw({ type: 'multipart/form-data', limit: '3mb' }),
  asyncHandler(async (req, res) => {
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('E-MKT-015-06', 400, 'Vui lòng chọn ảnh để tải lên.');
    res.status(201);
    sendData(res, await uploadContentImage(new Uint8Array(await file.arrayBuffer())));
  }),
);

// Landing page: đường dẫn cố định đứng trước `/:key`.
contentAdminRoutes.get('/landing-pages', asyncHandler(async (_req, res) => sendData(res, await listLandingPages())));

contentAdminRoutes.post(
  '/landing-pages',
  validateBody(createLandingSchema),
  asyncHandler(async (_req, res) => {
    const b = res.locals['body'] as z.infer<typeof createLandingSchema>;
    res.status(201);
    sendData(res, await createLandingPage(actor(res), b.name, b.slug));
  }),
);

contentAdminRoutes.get('/landing-pages/:slug', asyncHandler(async (req, res) => sendData(res, await getContent(lpKey(slug(req.params))))));

contentAdminRoutes.put(
  '/landing-pages/:slug',
  validateBody(saveSchema.extend(landingMetaSchema.shape)),
  asyncHandler(async (req, res) => {
    const { name, seoTitle, metaDescription, ...input } = res.locals['body'] as SaveInput & z.infer<typeof landingMetaSchema>;
    sendData(res, await saveContent(actor(res), lpKey(slug(req.params)), input, { name, seoTitle, metaDescription }));
  }),
);

contentAdminRoutes.post('/landing-pages/:slug/hide', asyncHandler(async (req, res) => sendData(res, await setLandingHidden(actor(res), slug(req.params), true))));
contentAdminRoutes.post('/landing-pages/:slug/show', asyncHandler(async (req, res) => sendData(res, await setLandingHidden(actor(res), slug(req.params), false))));
contentAdminRoutes.get('/landing-pages/:slug/versions', asyncHandler(async (req, res) => sendData(res, await listVersions(lpKey(slug(req.params))))));
contentAdminRoutes.post(
  '/landing-pages/:slug/versions/:id/restore',
  validateBody(restoreSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await restoreVersion(actor(res), lpKey(slug(req.params)), vid(req.params), (res.locals['body'] as { version: number }).version)),
  ),
);

// Trang chủ và thanh thông báo.
contentAdminRoutes.get('/:key', asyncHandler(async (req, res) => sendData(res, await getContent(key(req.params)))));

contentAdminRoutes.put(
  '/:key',
  validateBody(saveSchema),
  asyncHandler(async (req, res) => sendData(res, await saveContent(actor(res), key(req.params), res.locals['body'] as SaveInput))),
);

contentAdminRoutes.get('/:key/versions', asyncHandler(async (req, res) => sendData(res, await listVersions(key(req.params)))));
contentAdminRoutes.post(
  '/:key/versions/:id/restore',
  validateBody(restoreSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await restoreVersion(actor(res), key(req.params), vid(req.params), (res.locals['body'] as { version: number }).version)),
  ),
);
