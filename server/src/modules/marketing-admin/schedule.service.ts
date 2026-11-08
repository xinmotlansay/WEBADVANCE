import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { BannerModel } from '../banners/banner.model.js';
import { CollectionModel } from '../collections/collection.model.js';
import { AnnouncementModel } from '../announcements/announcement.model.js';
import { InspirationModel } from '../inspirations/inspiration.model.js';
import { logAdminAction } from './admin-log.js';

/** Lịch đăng: gom giờ đăng của banner, collection, nguồn cảm hứng và thanh thông báo vào một danh sách. */

export type ScheduleType = 'BANNER' | 'COLLECTION' | 'INSPIRATION' | 'ANNOUNCEMENT';
export type ScheduleState = 'SCHEDULED' | 'PUBLISHED';

export interface ScheduleEvent {
  /** Khóa ổn định cho giao diện: `<type>:<id>`. */
  key: string;
  type: ScheduleType;
  id: string;
  title: string;
  thumbnail: string | null;
  at: string;
  endAt: string | null;
  state: ScheduleState;
  /** Đường dẫn màn sửa trong admin. */
  editPath: string;
}

/** Giờ hẹn phải cách hiện tại ít nhất ngần này (giống thanh thông báo). */
export const MIN_LEAD_MS = 5 * 60 * 1000;

export const publishAtBodySchema = z.object({ publishAt: z.iso.datetime().optional() });

export function checkPublishAt(iso: string | undefined, now = new Date()): Date | undefined {
  if (!iso) return undefined;
  const at = new Date(iso);
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) {
    throw new AppError('VALIDATION_ERROR', 400, 'Giờ đăng phải sau hiện tại ít nhất 5 phút.');
  }
  return at;
}

export const scheduleQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;

const inRange = (at: Date | null | undefined, from: Date, to: Date): at is Date => !!at && at >= from && at < to;

export async function listSchedule(q: ScheduleQuery, now = new Date()): Promise<ScheduleEvent[]> {
  const from = new Date(q.from);
  const to = new Date(q.to);
  const events: ScheduleEvent[] = [];
  const state = (at: Date): ScheduleState => (at > now ? 'SCHEDULED' : 'PUBLISHED');

  const banners = await BannerModel.find({ deletedAt: null, status: { $ne: 'DRAFT' }, startDate: { $gte: from, $lt: to } }).lean();
  for (const b of banners) {
    events.push({
      key: `BANNER:${b._id}`,
      type: 'BANNER',
      id: String(b._id),
      title: b.title || b.code || 'Banner',
      thumbnail: b.imageUrl ?? null,
      at: b.startDate.toISOString(),
      endAt: b.endDate ? b.endDate.toISOString() : null,
      state: state(b.startDate),
      editPath: `/marketing/banner/${b._id}/sua`,
    });
  }

  // Dữ liệu cũ đăng ngay chưa có `publishAt`: lấy giờ cập nhật cuối làm giờ đăng.
  const collections = await CollectionModel.find({
    status: 'VISIBLE',
    $or: [{ publishAt: { $gte: from, $lt: to } }, { publishAt: null, updatedAt: { $gte: from, $lt: to } }],
  }).lean();
  for (const c of collections) {
    const publishedAt = c.publishAt ?? (c as { updatedAt?: Date }).updatedAt;
    if (!inRange(publishedAt, from, to)) continue;
    const images = [...c.images].sort((a, b) => a.displayOrder - b.displayOrder);
    events.push({
      key: `COLLECTION:${c._id}`,
      type: 'COLLECTION',
      id: String(c._id),
      title: c.name,
      thumbnail: (images.find((i) => i.isThumbnail) ?? images[0])?.url ?? null,
      at: publishedAt.toISOString(),
      endAt: null,
      state: state(publishedAt),
      editPath: `/marketing/collection/${c._id}/sua`,
    });
  }

  const inspirations = await InspirationModel.find({
    status: 'VISIBLE',
    $or: [{ publishAt: { $gte: from, $lt: to } }, { publishAt: null, updatedAt: { $gte: from, $lt: to } }],
  }).lean();
  for (const i of inspirations) {
    const publishedAt = i.publishAt ?? (i as { updatedAt?: Date }).updatedAt;
    if (!inRange(publishedAt, from, to)) continue;
    events.push({
      key: `INSPIRATION:${i._id}`,
      type: 'INSPIRATION',
      id: String(i._id),
      title: 'Ảnh nguồn cảm hứng',
      thumbnail: i.imageUrl,
      at: publishedAt.toISOString(),
      endAt: null,
      state: state(publishedAt),
      editPath: `/marketing/nguon-cam-hung/${i._id}/sua`,
    });
  }

  const announcements = await AnnouncementModel.find({
    deletedAt: null,
    status: 'LIVE',
    publishAt: { $gte: from, $lt: to },
  }).lean();
  for (const n of announcements) {
    if (!inRange(n.publishAt, from, to)) continue;
    events.push({
      key: `ANNOUNCEMENT:${n._id}`,
      type: 'ANNOUNCEMENT',
      id: String(n._id),
      title: n.text,
      thumbnail: null,
      at: n.publishAt.toISOString(),
      endAt: n.endAt ? n.endAt.toISOString() : null,
      state: state(n.publishAt),
      editPath: `/marketing/thanh-thong-bao/${n._id}/sua`,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

const badId = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy mục cần đổi lịch');

/** Đổi giờ đăng của một mục đã lên lịch. */
export async function reschedule(actorId: string, type: ScheduleType, id: string, publishAtIso: string, now = new Date()) {
  const at = checkPublishAt(publishAtIso, now);
  if (!at) throw new AppError('VALIDATION_ERROR', 400, 'Chọn giờ đăng.');
  {
    if (!Types.ObjectId.isValid(id)) throw badId();
    if (type === 'ANNOUNCEMENT') {
      const n = await AnnouncementModel.findOne({ _id: id, deletedAt: null, status: 'LIVE', publishAt: { $gt: now } }).lean();
      if (!n) throw badId();
      if (n.endAt && n.endAt <= at) throw new AppError('VALIDATION_ERROR', 400, 'Giờ đăng phải trước thời điểm kết thúc của thông báo.');
      await AnnouncementModel.updateOne({ _id: id }, { $set: { publishAt: at }, $inc: { version: 1 } });
    } else if (type === 'BANNER') {
      const b = await BannerModel.findOne({ _id: id, deletedAt: null, startDate: { $gt: now } }).lean();
      if (!b) throw badId();
      if (b.endDate && b.endDate <= at) throw new AppError('VALIDATION_ERROR', 400, 'Giờ đăng phải trước thời điểm kết thúc của banner.');
      await BannerModel.updateOne({ _id: id }, { $set: { startDate: at }, $inc: { version: 1 } });
    } else {
      const filter = { _id: id, status: 'VISIBLE' as const, publishAt: { $gt: now } };
      const update = { $set: { publishAt: at }, $inc: { version: 1 } };
      const res = type === 'COLLECTION' ? await CollectionModel.updateOne(filter, update) : await InspirationModel.updateOne(filter, update);
      if (!res.matchedCount) throw badId();
    }
  }
  logAdminAction(actorId, 'SCHEDULE_CHANGED', `${type}:${id}`, { publishAt: at });
  return { ok: true };
}

/** Hủy lịch: mục quay về trạng thái chưa đăng (nháp / ẩn), không bị xóa. */
export async function cancelSchedule(actorId: string, type: ScheduleType, id: string, now = new Date()) {
  {
    if (!Types.ObjectId.isValid(id)) throw badId();
    if (type === 'ANNOUNCEMENT') {
      const res = await AnnouncementModel.updateOne(
        { _id: id, deletedAt: null, status: 'LIVE', publishAt: { $gt: now } },
        { $set: { status: 'DRAFT', publishAt: null }, $inc: { version: 1 } },
      );
      if (!res.matchedCount) throw badId();
    } else if (type === 'BANNER') {
      const res = await BannerModel.updateOne(
        { _id: id, deletedAt: null, startDate: { $gt: now }, status: { $ne: 'DRAFT' } },
        { $set: { status: 'DRAFT' }, $inc: { version: 1 } },
      );
      if (!res.matchedCount) throw badId();
    } else {
      const filter = { _id: id, status: 'VISIBLE' as const, publishAt: { $gt: now } };
      const update = { $set: { status: 'HIDDEN' as const, publishAt: null }, $inc: { version: 1 } };
      const res = type === 'COLLECTION' ? await CollectionModel.updateOne(filter, update) : await InspirationModel.updateOne(filter, update);
      if (!res.matchedCount) throw badId();
    }
  }
  logAdminAction(actorId, 'SCHEDULE_CANCELLED', `${type}:${id}`);
  return { ok: true };
}
