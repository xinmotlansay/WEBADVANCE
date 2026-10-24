import { Router, raw } from 'express';
import { readMultipart, detectFile } from '../../utils/file-upload.js';
import { AppError } from '../../utils/app-error.js';
import { searchByImage } from './image-search.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { z } from 'zod';
import { ProductModel } from './product.model.js';
import { matchesSearch } from './search.service.js';

export const searchRoutes = Router();
const imageAttempts = new Map<string, { count: number; until: number }>();
searchRoutes.post(
  '/image',
  (req, _res, next) => {
    const now = Date.now();
    for (const [ip, entry] of imageAttempts) if (entry.until <= now) imageAttempts.delete(ip);
    const key = req.ip ?? 'unknown';
    const entry = imageAttempts.get(key) ?? { count: 0, until: now + 60000 };
    imageAttempts.set(key, entry);
    entry.count++;
    if (entry.count > 10) {
      _res.setHeader('Retry-After', Math.ceil((entry.until - now) / 1000));
      next(new AppError('TOO_MANY_REQUESTS', 429, 'Tối đa 10 lượt tìm ảnh mỗi phút.'));
      return;
    }
    next();
  },
  raw({ type: 'multipart/form-data', limit: '6mb' }),
  asyncHandler(async (req, res) => {
    const form = await readMultipart(req);
    const image = form.get('image');
    if (!(image instanceof File))
      throw new AppError('VALIDATION_ERROR', 400, 'Vui lòng chọn một ảnh');
    if (image.size > 5 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE', 413, 'Ảnh tối đa 5 MB');
    const bytes = new Uint8Array(await image.arrayBuffer());
    const format = detectFile(bytes);
    if (format.video)
      throw new AppError('UNSUPPORTED_FILE_TYPE', 415, 'Chỉ nhận ảnh JPG, PNG, WebP');
    sendData(res, await searchByImage(bytes, format.mime));
  }),
);
searchRoutes.get(
  '/suggestions',
  validateQuery(z.object({ q: z.string().trim().min(1).max(120) })),
  asyncHandler(async (_req, res) => {
    const { q } = res.locals['query'] as { q: string };
    const products = await ProductModel.find({ status: 'ACTIVE' }, { name: 1, searchKeywords: 1 })
      .sort({ name: 1 })
      .lean();
    const exact = products.filter((p) =>
      matchesSearch(q, p.name + ' ' + (p.searchKeywords ?? ''), false),
    );
    const matches = exact.length
      ? exact
      : products.filter((p) => matchesSearch(q, p.name + ' ' + (p.searchKeywords ?? '')));
    sendData(res, [...new Set(matches.map((p) => p.name))].slice(0, 6));
  }),
);
