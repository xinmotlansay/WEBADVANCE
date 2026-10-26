import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { BannerModel } from './banner.model.js';

export const bannerRoutes = Router();

bannerRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const banners = await BannerModel.find({
      status: 'VISIBLE',
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .sort({ displayOrder: 1 })
      .lean();

    sendData(
      res,
      banners.map((b) => ({
        id: b._id.toString(),
        title: b.title ?? '',
        content: b.content ?? '',
        imageUrl: b.imageUrl,
        linkUrl: b.linkUrl ?? '',
      })),
    );
  }),
);
