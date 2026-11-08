import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { AnnouncementModel, announcementStatus, type AnnouncementDoc } from '../announcements/announcement.model.js';
import { ContentAreaModel } from '../content/content.model.js';
import type { BarData } from '../content/content.model.js';
import { logAdminAction } from './admin-log.js';
import { isValidLink } from './banner-admin.rules.js';
import { stripTags } from './content-admin.rules.js';

/** Quản lý nhiều thông báo (kiểu Meta Business Suite): soạn nháp, đăng ngay / hẹn giờ, ẩn, sắp thứ tự. */

const MIN_LEAD_MS = 5 * 60 * 1000;
const alive = { deletedAt: null };

const bad = (message: string) => new AppError('E-MKT-015-01', 400, message);
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy thông báo');
const conflict = () => new AppError('CONFLICT', 409, 'Thông báo vừa được người khác thay đổi. Tải lại trang rồi thử lại.');

export const announcementInputSchema = z.object({
  text: z.string().trim().max(300),
  linkUrl: z.string().trim().max(500).default(''),
  endAt: z.iso.datetime().nullable().optional(),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export const announcementUpdateSchema = announcementInputSchema.extend({ version: z.number().int().min(0) });
export type AnnouncementUpdate = z.infer<typeof announcementUpdateSchema>;
export const announcementListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'HIDDEN']).optional(),
});
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;

function clean(input: AnnouncementInput): { text: string; linkUrl: string; endAt: Date | null } {
  const text = stripTags(input.text).text.trim();
  if (text.length < 5 || text.length > 120) throw bad('Nội dung thông báo phải từ 5 đến 120 ký tự.');
  if (input.linkUrl && !isValidLink(input.linkUrl)) throw bad('Liên kết phải bắt đầu bằng "/" (nội bộ) hoặc "https://".');
  return { text, linkUrl: input.linkUrl, endAt: input.endAt ? new Date(input.endAt) : null };
}

type Doc = AnnouncementDoc & { updatedAt?: Date };

const toRow = (a: Doc, now = new Date()) => ({
  id: String(a._id),
  text: a.text,
  linkUrl: a.linkUrl,
  status: announcementStatus(a, now),
  publishAt: a.publishAt ?? null,
  endAt: a.endAt ?? null,
  displayOrder: a.displayOrder,
  version: a.version,
  updatedAt: a.updatedAt ?? null,
});

/** Một lần: chuyển thanh thông báo cũ (một bản duy nhất) thành thông báo đầu tiên. Xóa mềm nên không bị tạo lại. */
let migrated = false;
export async function ensureAnnouncementsMigrated(now = new Date()): Promise<void> {
  if (migrated) return;
  if ((await AnnouncementModel.estimatedDocumentCount()) === 0) {
    const legacy = await ContentAreaModel.findOne({ key: 'ANNOUNCEMENT_BAR' }).lean();
    const sched = legacy?.scheduled && new Date(legacy.scheduled.publishAt) > now ? legacy.scheduled : null;
    const data = (sched?.data ?? legacy?.published ?? legacy?.draft) as BarData | null | undefined;
    if (data?.text) {
      const live = !!sched || !!legacy?.published;
      await AnnouncementModel.create({
        text: data.text,
        linkUrl: data.linkUrl ?? '',
        status: live && data.enabled ? 'LIVE' : 'DRAFT',
        publishAt: sched ? new Date(sched.publishAt) : data.startAt ? new Date(data.startAt) : (legacy?.updatedAt ?? now),
        endAt: data.endAt ? new Date(data.endAt) : null,
        displayOrder: 1,
      });
    }
  }
  migrated = true;
}

export async function listAnnouncements(q: AnnouncementListQuery, now = new Date()) {
  await ensureAnnouncementsMigrated(now);
  const docs = (await AnnouncementModel.find(alive).sort({ displayOrder: 1, _id: 1 }).lean()) as Doc[];
  const rows = docs.map((d) => toRow(d, now));
  const counts = { ALL: rows.length, DRAFT: 0, SCHEDULED: 0, ACTIVE: 0, ENDED: 0, HIDDEN: 0 };
  for (const r of rows) counts[r.status] += 1;
  return { items: q.status ? rows.filter((r) => r.status === q.status) : rows, counts };
}

async function load(id: string): Promise<Doc> {
  if (!Types.ObjectId.isValid(id)) throw notFound();
  const a = (await AnnouncementModel.findOne({ _id: id, ...alive }).lean()) as Doc | null;
  if (!a) throw notFound();
  return a;
}

export async function getAnnouncement(id: string, now = new Date()) {
  return toRow(await load(id), now);
}

export async function createAnnouncement(actorId: string, input: AnnouncementInput) {
  const set = clean(input);
  const last = await AnnouncementModel.findOne(alive).sort({ displayOrder: -1 }).lean();
  const doc = await AnnouncementModel.create({ ...set, status: 'DRAFT', displayOrder: (last?.displayOrder ?? 0) + 1 });
  logAdminAction(actorId, 'ANNOUNCEMENT_CREATED', String(doc._id));
  return getAnnouncement(String(doc._id));
}

export async function updateAnnouncement(actorId: string, id: string, input: AnnouncementUpdate) {
  const a = await load(id);
  const { version, ...rest } = input;
  if (a.version !== version) throw conflict();
  const set = clean(rest);
  if (set.endAt && a.publishAt && set.endAt <= a.publishAt) throw bad('Thời gian kết thúc phải sau thời gian bắt đầu.');
  const res = await AnnouncementModel.updateOne({ _id: id, version }, { $set: set, $inc: { version: 1 } });
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, 'ANNOUNCEMENT_UPDATED', id);
  return getAnnouncement(id);
}

/** Đăng đúng thông báo này: ngay bây giờ hoặc vào giờ hẹn. */
export async function publishAnnouncement(actorId: string, id: string, publishAt: Date | undefined, now = new Date()) {
  const a = await load(id);
  clean({ text: a.text, linkUrl: a.linkUrl, endAt: a.endAt?.toISOString() ?? null });
  const at = publishAt ?? now;
  if (publishAt && publishAt.getTime() < now.getTime() + MIN_LEAD_MS) throw bad('Giờ đăng phải sau hiện tại ít nhất 5 phút.');
  if (a.endAt && a.endAt <= at) throw bad('Thời gian kết thúc phải sau thời gian bắt đầu.');
  await AnnouncementModel.updateOne({ _id: id }, { $set: { status: 'LIVE', publishAt: at }, $inc: { version: 1 } });
  logAdminAction(actorId, 'ANNOUNCEMENT_PUBLISHED', id, { scheduled: !!publishAt });
  return getAnnouncement(id, now);
}

export async function setAnnouncementHidden(actorId: string, id: string, hidden: boolean, now = new Date()) {
  const a = await load(id);
  if (a.status === 'DRAFT') throw bad('Thông báo nháp chưa đăng nên không cần ẩn.');
  await AnnouncementModel.updateOne(
    { _id: id },
    { $set: hidden ? { status: 'HIDDEN' } : { status: 'LIVE', publishAt: a.publishAt ?? now }, $inc: { version: 1 } },
  );
  logAdminAction(actorId, hidden ? 'ANNOUNCEMENT_HIDDEN' : 'ANNOUNCEMENT_SHOWN', id);
  return getAnnouncement(id, now);
}

export async function deleteAnnouncement(actorId: string, id: string, now = new Date()) {
  const a = await load(id);
  if (announcementStatus(a, now) === 'ACTIVE') throw bad('Thông báo đang hiển thị. Hãy ẩn trước khi xóa.');
  await AnnouncementModel.updateOne({ _id: id }, { $set: { deletedAt: now } });
  logAdminAction(actorId, 'ANNOUNCEMENT_DELETED', id);
  return { ok: true };
}

export async function reorderAnnouncements(actorId: string, ids: string[]) {
  const docs = await AnnouncementModel.find({ ...alive }, '_id').lean();
  const known = new Set(docs.map((d) => String(d._id)));
  if (ids.length !== known.size || !ids.every((i) => known.has(i))) throw bad('Danh sách thứ tự không khớp. Tải lại trang rồi thử lại.');
  await AnnouncementModel.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { displayOrder: i + 1 } } } })));
  logAdminAction(actorId, 'ANNOUNCEMENT_REORDERED', 'all');
  return { ok: true };
}
