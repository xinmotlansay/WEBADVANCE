import { Router, type Response } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { requireUser } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { toObjectId } from '../../utils/object-id.js';
import { sendData } from '../../utils/response.js';
import { deleteReview, reportReview, updateReview } from './review.service.js';

/** Sửa, xóa, báo cáo đánh giá (FR-13, FR-21), mount tại `/reviews`. */
export const reviewRoutes = Router();

reviewRoutes.use(requireUser);

const userId = (res: Response): Types.ObjectId => res.locals['userId'] as Types.ObjectId;

const updateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
  images: z.array(z.string().max(500)).max(5).optional(),
});
const reportSchema = z.object({ reason: z.string().trim().min(1, 'Vui lòng nhập lý do').max(300) });

reviewRoutes.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await updateReview(userId(res), toObjectId(String(req.params['id'])), res.locals['body'] as z.infer<typeof updateSchema>),
    );
  }),
);

reviewRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteReview(userId(res), toObjectId(String(req.params['id'])));
    sendData(res, { deleted: true });
  }),
);

reviewRoutes.post(
  '/:id/reports',
  validateBody(reportSchema),
  asyncHandler(async (req, res) => {
    await reportReview(userId(res), toObjectId(String(req.params['id'])), (res.locals['body'] as { reason: string }).reason);
    res.status(201);
    sendData(res, { reported: true });
  }),
);
