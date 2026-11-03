import { Router, raw } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { readMultipart } from '../../utils/file-upload.js';
import { sendData } from '../../utils/response.js';
import { saveSchema, type SaveInput } from './content-admin.rules.js';
import { getContent, saveContent, uploadContentImage } from './content-admin.service.js';

/** `/api/v1/admin/marketing/content`: quyền đã kiểm ở router cha. */
export const contentAdminRoutes = Router();

const keySchema = z.enum(['HOME', 'ANNOUNCEMENT_BAR']);
const key = (p: { key?: string | string[] }) => keySchema.parse(String(p.key));

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

contentAdminRoutes.get('/:key', asyncHandler(async (req, res) => sendData(res, await getContent(key(req.params)))));

contentAdminRoutes.put(
  '/:key',
  validateBody(saveSchema),
  asyncHandler(async (req, res) =>
    sendData(res, await saveContent(String(res.locals['userId']), key(req.params), res.locals['body'] as SaveInput)),
  ),
);
