import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import { AppError } from '../../utils/app-error.js';
import { ProductModel } from '../products/product.model.js';
import { buildListItems } from '../products/product.service.js';
import { InspirationModel } from './inspiration.model.js';

export const inspirationRoutes = Router();

inspirationRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const inspirations = await InspirationModel.find({ status: 'VISIBLE' }).sort({ _id: 1 }).lean();
    sendData(
      res,
      inspirations.map((i) => ({ id: i._id.toString(), imageUrl: i.imageUrl })),
    );
  }),
);

/** Ảnh cảm hứng kèm các sản phẩm đang bán xuất hiện trong ảnh, theo thứ tự hiển thị. */
inspirationRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const inspiration = await InspirationModel.findOne({
      _id: toObjectId(String(req.params['id'])),
      status: 'VISIBLE',
    }).lean();
    if (!inspiration) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy nguồn cảm hứng');

    const ordered = [...inspiration.products].sort((a, b) => a.displayOrder - b.displayOrder);
    const products = await ProductModel.find({
      _id: { $in: ordered.map((p) => p.productId) },
      status: 'ACTIVE',
    }).lean();
    const items = await buildListItems(products);
    const rank = new Map(ordered.map((p, index) => [p.productId.toString(), index]));
    items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    sendData(res, {
      id: inspiration._id.toString(),
      imageUrl: inspiration.imageUrl,
      products: items,
    });
  }),
);
