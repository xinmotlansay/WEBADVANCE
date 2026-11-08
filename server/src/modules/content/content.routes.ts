import { Router } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { CategoryModel } from '../categories/category.model.js';
import { CollectionModel } from '../collections/collection.model.js';
import { collectionTile, effectivePublished, lpKey } from '../marketing-admin/content-admin.rules.js';
import { promotionStatus } from '../marketing-admin/effective-status.js';
import { PromotionModel } from '../promotions/promotion.model.js';
import { ContentAreaModel, type HomeData } from './content.model.js';
import { AnnouncementModel, liveAnnouncementFilter } from '../announcements/announcement.model.js';
import { ensureAnnouncementsMigrated } from '../marketing-admin/announcement-admin.service.js';

/** Nội dung marketing phía khách: chỉ đọc bản đã đăng (kể cả bản hẹn giờ đã đến giờ). */
export const contentRoutes = Router();

const ids = (a: string[]) => a.filter((i) => Types.ObjectId.isValid(i));
/** Giữ đúng thứ tự người soạn đã chọn. */
const inOrder = <T extends { _id: Types.ObjectId }>(order: string[], docs: T[]): T[] => {
  const by = new Map(docs.map((d) => [String(d._id), d]));
  return order.map((i) => by.get(i)).filter((d): d is T => !!d);
};

/** Dựng danh sách khối để hiển thị: bỏ khối tắt và khối không còn dữ liệu hợp lệ. */
async function resolveBlocks(home: HomeData | null, now: Date) {
  const blocks = [];
  for (const b of home?.blocks ?? []) {
    if (!b.enabled) continue;
    const base = { type: b.type, title: b.title, text: b.text, imageUrl: b.imageUrl, imageAlt: b.imageAlt, ctaLabel: b.ctaLabel, ctaUrl: b.ctaUrl };
    let items: unknown[] = [];
    if (b.type === 'COLLECTIONS' && b.collectionIds?.length) {
      // Collection đã ẩn/xóa bị bỏ qua; hết collection thì khối tự ẩn.
      const cols = inOrder(b.collectionIds, await CollectionModel.find({ _id: { $in: ids(b.collectionIds) }, status: 'VISIBLE' }, 'name slug images').lean());
      if (!cols.length) continue;
      items = cols.map(collectionTile);
    } else if (b.type === 'COLLECTIONS') {
      // Khối cũ chọn theo danh mục.
      const cats = inOrder(b.categoryIds, await CategoryModel.find({ _id: { $in: ids(b.categoryIds) }, status: 'VISIBLE' }, 'name slug image').lean());
      items = cats.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, imageUrl: c.image }));
    } else if (b.type === 'PROMOTION') {
      const promos = (await PromotionModel.find({ _id: { $in: ids(b.promotionIds) } }).lean()).filter((p) => promotionStatus(p, now) === 'RUNNING');
      if (!promos.length) continue;
      items = inOrder(b.promotionIds, promos).map((p) => ({ id: String(p._id), name: p.name, endDate: p.endDate }));
    } else if (b.type !== 'COLLECTIONS') {
      continue; // khối cũ không còn trên trang chủ
    }
    blocks.push({ ...base, items });
  }
  return blocks;
}

/** Landing page `/lp/:slug`: chưa đăng, đã ẩn hoặc không tồn tại → 404. */
contentRoutes.get(
  '/lp/:slug',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const doc = await ContentAreaModel.findOne({ key: lpKey(String(req.params['slug'])) }).lean();
    const home = doc && !doc.hidden ? (effectivePublished(doc, now) as HomeData | null) : null;
    if (!doc || !home) throw new AppError('NOT_FOUND', 404, 'Trang không tồn tại hoặc đã được ẩn.');
    sendData(res, {
      name: doc.name ?? '',
      seoTitle: doc.seoTitle || doc.name || '',
      metaDescription: doc.metaDescription ?? '',
      blocks: await resolveBlocks(home, now),
    });
  }),
);

/** Các thông báo đang hiển thị, theo thứ tự admin sắp xếp; website cho hiện lần lượt. */
contentRoutes.get(
  '/announcements',
  asyncHandler(async (_req, res) => {
    await ensureAnnouncementsMigrated();
    const items = await AnnouncementModel.find(liveAnnouncementFilter()).sort({ displayOrder: 1, _id: 1 }).lean();
    sendData(res, items.map((a) => ({ id: String(a._id), text: a.text, linkUrl: a.linkUrl || null })));
  }),
);
