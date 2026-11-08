import { Router, raw } from 'express';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import {
  createArticleSchema,
  updateArticleSchema,
  type CreateArticleInput,
  type UpdateArticleInput,
} from './article-admin.rules.js';
import {
  createArticle,
  getArticle,
  listArticles,
  listQuerySchema,
  setHidden,
  updateArticle,
  uploadArticleCover,
  type ListQuery,
} from './article-admin.service.js';

/** `/api/v1/admin/marketing/articles`: quyền đã kiểm ở router cha. */
export const articleAdminRoutes = Router();

const actor = (res: { locals: Record<string, unknown> }): string => String(res.locals['userId']);
const id = (p: { id?: string | string[] }): string => String(p.id);

articleAdminRoutes.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (_req, res) => sendData(res, await listArticles(res.locals['query'] as ListQuery))),
);

// Đường dẫn cố định phải đứng trước `/:id`.
articleAdminRoutes.post(
  '/cover',
  raw({ type: 'multipart/form-data', limit: '3mb' }),
  asyncHandler(async (req, res) => {
    const file = (await readMultipart(req)).get('file');
    if (!(file instanceof File)) throw new AppError('E-MKT-016-03', 400, 'Vui lòng chọn ảnh bìa để tải lên.');
    res.status(201);
    sendData(res, await uploadArticleCover(new Uint8Array(await file.arrayBuffer())));
  }),
);

articleAdminRoutes.post(
  '/',
  validateBody(createArticleSchema),
  asyncHandler(async (_req, res) => {
    res.status(201);
    sendData(res, await createArticle(actor(res), res.locals['body'] as CreateArticleInput));
  }),
);

articleAdminRoutes.get('/:id', asyncHandler(async (req, res) => sendData(res, await getArticle(id(req.params)))));

articleAdminRoutes.put(
  '/:id',
  validateBody(updateArticleSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await updateArticle(actor(res), id(req.params), res.locals['body'] as UpdateArticleInput)),
  ),
);

articleAdminRoutes.post('/:id/hide', asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), true))));
articleAdminRoutes.post('/:id/show', asyncHandler(async (req, res) => sendData(res, await setHidden(actor(res), id(req.params), false))));
