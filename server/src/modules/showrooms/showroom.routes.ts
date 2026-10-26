import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { ShowroomModel } from './showroom.model.js';

const showroomQuerySchema = z.object({
  region: z.enum(['NORTH', 'CENTRAL', 'SOUTH']).optional(),
});

export const showroomRoutes = Router();

showroomRoutes.get(
  '/',
  validateQuery(showroomQuerySchema),
  asyncHandler(async (_req, res) => {
    const { region } = res.locals['query'] as z.infer<typeof showroomQuerySchema>;
    const showrooms = await ShowroomModel.find({ status: 'VISIBLE', ...(region ? { region } : {}) })
      .sort({ displayOrder: 1 })
      .lean();

    sendData(
      res,
      showrooms.map((s) => ({
        id: s._id.toString(),
        name: s.name,
        slug: s.slug,
        city: s.city,
        region: s.region,
        address: s.address,
        phone: s.phone ?? '',
        openTime: s.openTime,
        closeTime: s.closeTime,
        latitude: s.latitude,
        longitude: s.longitude,
        image: s.image,
        isFlagship: s.isFlagship,
      })),
    );
  }),
);
