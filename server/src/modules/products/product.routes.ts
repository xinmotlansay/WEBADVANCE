import { Router } from 'express';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendPage, sendData } from '../../utils/response.js';
import { listProducts, getProductDetail } from './product.service.js';
import { AppError } from '../../utils/app-error.js';
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
  '/:slug',
  asyncHandler(async (req, res) => {
    const product = await getProductDetail(String(req.params['slug']));
    if (!product) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy sản phẩm');
    sendData(res, product);
  }),
);
