import { Router } from 'express';
import { toObjectId } from '../../utils/object-id.js';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData, sendPage } from '../../utils/response.js';
import { getProductReviews } from '../reviews/review.service.js';
import { getProductDetail, getProductFacets, listProducts } from './product.service.js';
import { productListQuerySchema, type ProductListQuery } from './product.schema.js';

export const productRoutes = Router();

productRoutes.get(
  '/',
  validateQuery(productListQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals['query'] as ProductListQuery;
    const { items, total } = await listProducts(query);
    sendPage(res, items, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }),
);

productRoutes.get(
  '/facets',
  validateQuery(productListQuerySchema),
  asyncHandler(async (_req, res) => {
    sendData(res, await getProductFacets(res.locals['query'] as ProductListQuery));
  }),
);

/** FR-21: đánh giá `VISIBLE` của sản phẩm, mới nhất trước. */
productRoutes.get(
  '/:productId/reviews',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query['page']) || 1);
    const limit = Math.min(20, Math.max(1, Number(req.query['limit']) || 5));
    const result = await getProductReviews(toObjectId(String(req.params['productId'])), page, limit);
    sendData(res, { ...result, page, totalPages: Math.ceil(result.total / limit) });
  }),
);

productRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    sendData(res, await getProductDetail(String(req.params['slug'])));
  }),
);
