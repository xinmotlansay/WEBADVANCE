import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { BannerModel } from './banner.model.js';

export const bannerRoutes = Router();

const querySchema = z.object({
  position: z.enum(['HOME_SLIDER', 'HOME_MIDDLE', 'CATEGORY', 'POPUP']).default('HOME_SLIDER'),
  /** Banner trang danh mục: chỉ lấy banner áp dụng cho danh mục này. */
  categoryId: z.string().optional(),
});

bannerRoutes.get(
  '/',
  validateQuery(querySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof querySchema>;
    const now = new Date();
    const banners = await BannerModel.find({
      status: 'VISIBLE',
      deletedAt: null,
      // Banner cũ chưa có `position` coi như slider trang chủ.
      position: q.position === 'HOME_SLIDER' ? { $in: ['HOME_SLIDER', null] } : q.position,
      ...(q.position === 'CATEGORY' && q.categoryId ? { categoryIds: q.categoryId } : {}),
      startDate: { $lte: now },
      // endDate trống là không giới hạn; null khớp cả bản ghi không có field
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    sendData(
      res,
      banners.map((b) => ({
        id: b._id.toString(),
        title: b.title ?? '',
        content: b.content ?? '',
        imageUrl: b.imageUrl,
        mobileImageUrl: b.mobileImageUrl ?? '',
        linkUrl: b.linkUrl ?? '',
        ctaLabel: b.ctaLabel ?? '',
        openInNewTab: b.openInNewTab ?? false,
        popupFrequency: b.popupFrequency ?? null,
      })),
    );
  }),
);

/**
 * Ghi lượt hiển thị / nhấp. Client tự giới hạn 1 lượt mỗi phiên; không cần đăng nhập nên chỉ tăng bộ đếm,
 * không lưu danh tính. ponytail: chưa chống gọi lặp từ bên ngoài, thêm rate limit theo IP khi cần số liệu chính xác.
 */
for (const [action, field] of [
  ['impression', 'impressionCount'],
  ['click', 'clickCount'],
] as const) {
  bannerRoutes.post(
    `/:id/${action}`,
    asyncHandler(async (req, res) => {
      await BannerModel.updateOne({ _id: String(req.params['id']), deletedAt: null }, { $inc: { [field]: 1 } }).catch(
        () => undefined,
      );
      res.status(204).end();
    }),
  );
}
