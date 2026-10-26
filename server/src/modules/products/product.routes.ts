import { Router } from 'express';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendPage } from '../../utils/response.js';
import { listProducts } from './product.service.js';
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
