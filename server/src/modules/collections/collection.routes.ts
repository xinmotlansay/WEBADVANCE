import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { CollectionModel } from './collection.model.js';
import { ProductModel } from '../products/product.model.js';
import { buildListItems } from '../products/product.service.js';
import { AppError } from '../../utils/app-error.js';

export const collectionRoutes = Router();

collectionRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const collections = await CollectionModel.find({ status: 'VISIBLE' })
      .sort({ displayOrder: 1 })
      .lean();

    sendData(
      res,
      collections.map((c) => {
        const images = [...c.images].sort((a, b) => a.displayOrder - b.displayOrder);
        const thumbnail = (images.find((i) => i.isThumbnail) ?? images[0])?.url ?? '';
        return {
          id: c._id.toString(),
          name: c.name,
          slug: c.slug,
          slogan: c.slogan,
          shortDescription: c.shortDescription ?? '',
          thumbnail,
        };
      }),
    );
  }),
);

collectionRoutes.get('/:slug', asyncHandler(async (req, res) => {
  const collection = await CollectionModel.findOne({ slug: String(req.params['slug']), status: 'VISIBLE' }).lean();
  if (!collection) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bộ sưu tập');
  const ids = [...collection.products.map((p) => p.productId), ...collection.images.flatMap((image) => image.hotspots.map((h) => h.productId))];
  const products = await buildListItems(await ProductModel.find({ _id: { $in: ids }, status: 'ACTIVE' }).lean());
  const byId = new Map(products.map((p) => [p.id, p]));
  sendData(res, { id: collection._id.toString(), name: collection.name, slogan: collection.slogan, description: collection.description ?? '',
    images: [...collection.images].sort((a,b) => a.displayOrder - b.displayOrder).map((image) => ({ id: image._id.toString(), url: image.url, title: image.title ?? '', isThumbnail: image.isThumbnail, displayOrder: image.displayOrder,
      hotspots: [...image.hotspots].sort((a,b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).flatMap((h) => { const product = byId.get(h.productId.toString()); return product ? [{ x: h.x, y: h.y, product }] : []; }) })),
    products: [...collection.products].sort((a,b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).flatMap((p) => { const item = byId.get(p.productId.toString()); return item ? [item] : []; }),
  });
}));
