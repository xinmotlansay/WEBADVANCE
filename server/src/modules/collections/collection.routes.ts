import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/app-error.js';
import { sendData } from '../../utils/response.js';
import { ProductModel } from '../products/product.model.js';
import { buildListItems } from '../products/product.service.js';
import { CollectionModel } from './collection.model.js';

const liveNow = () => ({ status: 'VISIBLE' as const, $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] });

export const collectionRoutes = Router();

collectionRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const collections = await CollectionModel.find(liveNow())
      .sort({ displayOrder: 1 })
      .lean();

    const covers = collections.map((c) => {
      const images = [...c.images].sort((a, b) => a.displayOrder - b.displayOrder);
      return images.find((i) => i.isThumbnail) ?? images[0];
    });
    const products = await ProductModel.find({
      _id: { $in: covers.flatMap((cover) => (cover?.hotspots ?? []).map((h) => h.productId)) },
      status: 'ACTIVE',
    }).lean();
    const itemById = new Map((await buildListItems(products)).map((item) => [item.id, item]));

    sendData(
      res,
      collections.map((c, index) => {
        const cover = covers[index];
        const thumbnail = cover?.url ?? '';
        return {
          id: c._id.toString(),
          name: c.name,
          slug: c.slug,
          slogan: c.slogan,
          shortDescription: c.shortDescription ?? '',
          thumbnail,
          /** Ảnh đại diện kèm hotspot, để slider trang chủ cho xem nhanh sản phẩm. */
          thumbnailImage: cover && {
            id: cover._id.toString(),
            url: cover.url,
            title: cover.title ?? '',
            description: cover.description ?? '',
            hotspots: cover.hotspots.flatMap((h) => {
              const product = itemById.get(h.productId.toString());
              return product ? [{ slug: product.slug, product, x: h.x, y: h.y }] : [];
            }),
          },
        };
      }),
    );
  }),
);

/** Chi tiết collection: ảnh kèm hotspot trỏ tới sản phẩm, và danh sách sản phẩm theo thứ tự hiển thị. */
collectionRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const collection = await CollectionModel.findOne({
      slug: String(req.params['slug']),
      ...liveNow(),
    }).lean();
    if (!collection) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bộ sưu tập');

    const ordered = [...collection.products].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
    );
    const hotspotIds = collection.images.flatMap((image) =>
      image.hotspots.map((hotspot) => hotspot.productId),
    );
    const products = await ProductModel.find({
      _id: { $in: [...ordered.map((p) => p.productId), ...hotspotIds] },
      status: 'ACTIVE',
    }).lean();
    const itemById = new Map(
      (await buildListItems(products)).map((item) => [item.id, item]),
    );

    const rank = new Map(ordered.map((p, index) => [p.productId.toString(), index]));
    const items = [...itemById.values()]
      .filter((item) => rank.has(item.id))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    // Ảnh chính (ảnh đại diện) đứng đầu: làm ảnh bìa; các ảnh sau là ảnh phụ.
    const images = [...collection.images].sort(
      (a, b) => Number(b.isThumbnail) - Number(a.isThumbnail) || a.displayOrder - b.displayOrder,
    );

    sendData(res, {
      id: collection._id.toString(),
      name: collection.name,
      slug: collection.slug,
      slogan: collection.slogan,
      shortDescription: collection.shortDescription ?? '',
      description: collection.description ?? '',
      images: images.map((image) => ({
        id: image._id.toString(),
        url: image.url,
        title: image.title ?? '',
        description: image.description ?? '',
        hotspots: image.hotspots.flatMap((hotspot) => {
          const product = itemById.get(hotspot.productId.toString());
          return product ? [{ slug: product.slug, product, x: hotspot.x, y: hotspot.y }] : [];
        }),
      })),
      products: items,
    });
  }),
);
