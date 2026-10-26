import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { CollectionModel } from './collection.model.js';

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
