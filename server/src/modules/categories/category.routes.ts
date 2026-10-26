import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { getCategoryBySlug, getCategoryTree } from './category.service.js';

const categoryQuerySchema = z.object({
  type: z.enum(['PRODUCT_CATEGORY', 'ROOM', 'STYLE']).optional(),
});

export const categoryRoutes = Router();

categoryRoutes.get(
  '/',
  validateQuery(categoryQuerySchema),
  asyncHandler(async (_req, res) => {
    const { type } = res.locals['query'] as z.infer<typeof categoryQuerySchema>;
    sendData(res, await getCategoryTree(type));
  }),
);

categoryRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    sendData(res, await getCategoryBySlug(String(req.params['slug'])));
  }),
);
