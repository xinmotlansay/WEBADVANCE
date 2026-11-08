import { Types } from 'mongoose';
import sharp from 'sharp';
import { z } from 'zod';
import { uploadPublicFile } from '../../lib/supabase-storage.js';
import { AppError } from '../../utils/app-error.js';
import { detectFile } from '../../utils/file-upload.js';
import { BannerModel, type BannerDoc, type BannerPosition } from '../banners/banner.model.js';
import { ProductModel } from '../products/product.model.js';
import { logAdminAction } from './admin-log.js';
import {
  MAX_BULK,
  POSITIONS,
  POSITION_RULES,
  checkBannerValues,
  checkCapacity,
  checkImage,
  ctr,
  isExternalLink,
  nextBannerCode,
  productSlugOf,
  sortBanners,
  type CreateBannerInput,
  type UpdateBannerInput,
} from './banner-admin.rules.js';
import { bannerStatus, type BannerStatus } from './effective-status.js';

const conflict = () => new AppError('E-COM-05', 409, 'Banner vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy banner');
const alive = { deletedAt: null };
/** Banner cũ chưa có `position` coi như slider trang chủ. */
const posQuery = (p: BannerPosition) => (p === 'HOME_SLIDER' ? { $in: ['HOME_SLIDER', null] } : p) as never;

export const listQuerySchema = z.object({
  position: z.enum(POSITIONS).default('HOME_SLIDER'),
  status: z.enum(['VISIBLE', 'SCHEDULED', 'HIDDEN', 'DRAFT', 'EXPIRED']).optional(),
  q: z.string().trim().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Slug sản phẩm trong liên kết nội bộ → có đang hiển thị không (cờ "Liên kết lỗi", E-MKT-012-05). */
async function brokenLinks(banners: Pick<BannerDoc, 'linkUrl'>[]): Promise<Set<string>> {
  const slugs = [...new Set(banners.map((b) => productSlugOf(b.linkUrl)).filter((s): s is string => !!s))];
  if (!slugs.length) return new Set();
  const ok = new Set((await ProductModel.find({ slug: { $in: slugs }, status: 'ACTIVE' }, 'slug').lean()).map((p) => p.slug));
  return new Set(slugs.filter((s) => !ok.has(s)));
}

const toRow = (b: BannerDoc & { createdAt?: Date }, broken: Set<string>, now: Date) => {
  const slug = productSlugOf(b.linkUrl);
  return {
    id: String(b._id),
    code: b.code ?? '',
    position: b.position ?? 'HOME_SLIDER',
    title: b.title ?? '',
    content: b.content ?? '',
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl ?? null,
    linkUrl: b.linkUrl ?? '',
    ctaLabel: b.ctaLabel ?? null,
    openInNewTab: b.openInNewTab ?? (b.linkUrl ? isExternalLink(b.linkUrl) : false),
    startDate: b.startDate,
    endDate: b.endDate ?? null,
    displayOrder: b.displayOrder,
    status: bannerStatus(b, now),
    impressions: b.impressionCount,
    clicks: b.clickCount,
    ctr: ctr(b.impressionCount, b.clickCount),
    flags: slug && broken.has(slug) ? ['BROKEN_LINK' as const] : [],
    categoryIds: (b.categoryIds ?? []).map(String),
    popupFrequency: b.popupFrequency ?? null,
    version: b.version ?? 0,
    createdAt: b.createdAt,
  };
};

/** Số banner đang hiển thị / tối đa của mọi vị trí, để hiện trên tiêu đề tab. */
async function counts(now: Date) {
  const all = await BannerModel.find(alive, 'position status startDate endDate').lean();
  return Object.fromEntries(
    POSITIONS.map((p) => [
      p,
      {
        label: POSITION_RULES[p].label,
        visible: all.filter((b) => (b.position ?? 'HOME_SLIDER') === p && bannerStatus(b, now) === 'VISIBLE').length,
        max: POSITION_RULES[p].max,
        recommended: POSITION_RULES[p].recommended,
      },
    ]),
  );
}

/** Số banner đang hiển thị ở một vị trí, không tính banner `exceptId`. */
async function visibleCount(position: BannerPosition, now: Date, exceptId?: string): Promise<number> {
  const rows = await BannerModel.find({ ...alive, position: posQuery(position) }, 'status startDate endDate').lean();
  return rows.filter((b) => String(b._id) !== exceptId && bannerStatus(b, now) === 'VISIBLE').length;
}

export async function listBanners(q: ListQuery, now = new Date()) {
  // ponytail: lọc/sắp xếp trong bộ nhớ vì trạng thái tính lúc đọc; mỗi vị trí chỉ vài chục banner.
  const docs = await BannerModel.find({ ...alive, position: posQuery(q.position) }).lean();
  const broken = await brokenLinks(docs);
  let rows = docs.map((d) => toRow(d, broken, now));
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  if (q.q) rows = rows.filter((r) => r.title.toLowerCase().includes(q.q!.toLowerCase()));
  return { items: sortBanners(rows), counts: await counts(now) };
}

async function load(id: string): Promise<BannerDoc & { createdAt?: Date }> {
  // ponytail: ép kiểu vì .lean() trả kiểu hẹp hơn BannerDoc

  const b = Types.ObjectId.isValid(id) ? await BannerModel.findOne({ _id: id, ...alive }).lean() : null;
  if (!b) throw notFound();
  return b as BannerDoc & { createdAt?: Date };
}

export async function getBanner(id: string, now = new Date()) {
  const b = await load(id);
  return toRow(b, await brokenLinks([b]), now);
}

/** E-MKT-012-05: liên kết nội bộ trỏ tới sản phẩm không còn hiển thị. */
async function assertLinkVisible(link: string | null | undefined, code = 'E-MKT-012-05', message?: string): Promise<void> {
  const slug = productSlugOf(link);
  if (slug && (await brokenLinks([{ linkUrl: link ?? undefined }])).has(slug)) {
    throw new AppError(code, 400, message ?? 'Liên kết trỏ tới sản phẩm đang không hiển thị trên website.');
  }
}

export async function createBanner(actorId: string, input: CreateBannerInput, now = new Date()) {
  const startDate = input.startNow || !input.startDate ? now : input.startDate;
  if (!input.startNow && input.startDate && input.startDate.getTime() < now.getTime() - 60_000) {
    throw new AppError('E-MKT-012-01', 400, 'Thời gian bắt đầu không được ở quá khứ.');
  }
  checkBannerValues(input, startDate, input.endDate);
  if (input.publish) {
    await assertLinkVisible(input.linkUrl);
    if (startDate <= now) checkCapacity(input.position, await visibleCount(input.position, now));
  }
  const status = input.publish ? 'VISIBLE' : 'DRAFT';
  for (let attempt = 0; ; attempt += 1) {
    const last = await BannerModel.findOne({ code: /^BN\d{5}$/ }, 'code').sort({ code: -1 }).lean();
    try {
      const doc = await BannerModel.create({
        code: nextBannerCode(last?.code),
        position: input.position,
        title: input.title,
        content: input.content,
        imageUrl: input.imageUrl,
        mobileImageUrl: input.mobileImageUrl ?? undefined,
        ctaLabel: input.ctaLabel ?? undefined,
        linkUrl: input.linkUrl || undefined,
        openInNewTab: input.openInNewTab ?? (input.linkUrl ? isExternalLink(input.linkUrl) : false),
        startDate,
        endDate: input.endDate ?? null,
        displayOrder: input.displayOrder,
        status,
        categoryIds: input.position === 'CATEGORY' ? input.categoryIds : [],
        popupFrequency: input.position === 'POPUP' ? input.popupFrequency : undefined,
      });
      logAdminAction(actorId, 'BANNER_CREATE', doc.code ?? String(doc._id), { position: input.position, status });
      return getBanner(String(doc._id), now);
    } catch (e) {
      if ((e as { code?: number }).code !== 11000 || attempt >= 2) throw e; // trùng mã do tạo song song: thử lại
    }
  }
}

export async function updateBanner(actorId: string, id: string, patch: UpdateBannerInput, now = new Date()) {
  const b = await load(id);
  const { version, publish, startNow, ...fields } = patch;
  if ((b.version ?? 0) !== version) throw conflict();
  const current = bannerStatus(b, now);

  // Hết hạn chỉ được gia hạn (FR-013).
  if (current === 'EXPIRED' && Object.keys(fields).some((k) => k !== 'endDate')) {
    throw new AppError('E-MKT-013-01', 400, 'Banner đã hết hạn chỉ được gia hạn thời gian kết thúc.');
  }
  const startDate = startNow ? now : (fields.startDate ?? b.startDate);
  const endDate = fields.endDate === undefined ? b.endDate : fields.endDate;
  if (current === 'EXPIRED' && (!endDate || endDate <= now)) {
    throw new AppError('E-MKT-013-01', 400, 'Thời gian kết thúc mới phải sau thời điểm hiện tại.');
  }
  const merged = {
    position: b.position ?? 'HOME_SLIDER',
    linkUrl: fields.linkUrl === undefined ? b.linkUrl : fields.linkUrl,
    ctaLabel: fields.ctaLabel === undefined ? b.ctaLabel : fields.ctaLabel,
    categoryIds: fields.categoryIds ?? (b.categoryIds ?? []).map(String),
    popupFrequency: fields.popupFrequency ?? b.popupFrequency,
  };
  checkBannerValues(merged, startDate, endDate);

  const nextStatus = current === 'EXPIRED' ? 'VISIBLE' : publish ? 'VISIBLE' : b.status;
  const willShow = nextStatus === 'VISIBLE' && startDate <= now && (!endDate || endDate > now);
  if (nextStatus === 'VISIBLE') await assertLinkVisible(merged.linkUrl, 'E-MKT-012-05');
  if (willShow && bannerStatus(b, now) !== 'VISIBLE') {
    checkCapacity(merged.position, await visibleCount(merged.position, now, id));
  }

  const set: Record<string, unknown> = { startDate, endDate: endDate ?? null, status: nextStatus };
  for (const k of ['title', 'content', 'imageUrl', 'mobileImageUrl', 'ctaLabel', 'openInNewTab', 'displayOrder', 'popupFrequency'] as const) {
    if (fields[k] !== undefined) set[k] = fields[k] ?? undefined;
  }
  if (fields.linkUrl !== undefined) set['linkUrl'] = fields.linkUrl || undefined;
  if (fields.categoryIds !== undefined) set['categoryIds'] = fields.categoryIds;
  // Đổi ảnh khi đang hiển thị: số liệu trước/sau đổi ảnh tách thành hai giai đoạn (FR-013): lưu mốc.
  if (fields.imageUrl && fields.imageUrl !== b.imageUrl && current === 'VISIBLE') set['imageChangedAt'] = now;

  const res = await BannerModel.updateOne({ _id: id, version: b.version ?? 0 }, { $set: set, $inc: { version: 1 } });
  if (res.modifiedCount === 0) throw conflict();
  logAdminAction(actorId, 'BANNER_UPDATE', b.code ?? id, { changed: Object.keys(fields) });
  return getBanner(id, now);
}

/** Tạm ẩn / hiển thị lại nhanh, không cần mở form. */
export async function setHidden(actorId: string, id: string, hidden: boolean, now = new Date()) {
  const b = await load(id);
  const current = bannerStatus(b, now);
  if (hidden) {
    if (current === 'HIDDEN' || current === 'DRAFT' || current === 'EXPIRED') {
      throw new AppError('VALIDATION_ERROR', 400, 'Chỉ banner đang hiển thị hoặc đã lên lịch mới tạm ẩn được.');
    }
  } else {
    if (current !== 'HIDDEN') throw new AppError('VALIDATION_ERROR', 400, 'Banner này không ở trạng thái tạm ẩn.');
    await assertLinkVisible(
      b.linkUrl,
      'E-MKT-013-02',
      'Liên kết của banner đang trỏ tới nội dung không còn hiển thị. Vui lòng cập nhật liên kết trước.',
    );
    if (b.startDate <= now) checkCapacity(b.position ?? 'HOME_SLIDER', await visibleCount(b.position ?? 'HOME_SLIDER', now, id));
  }
  await BannerModel.updateOne({ _id: id }, { $set: { status: hidden ? 'HIDDEN' : 'VISIBLE' }, $inc: { version: 1 } });
  logAdminAction(actorId, hidden ? 'BANNER_HIDE' : 'BANNER_SHOW', b.code ?? id);
  return getBanner(id, now);
}

/** Xóa mềm (số liệu giữ cho thống kê, FR-014). Banner đang hiển thị phải tạm ẩn trước. Kiểm hết rồi mới ghi. */
export async function deleteBanners(actorId: string, ids: string[], now = new Date()) {
  if (ids.length > MAX_BULK) throw new AppError('E-MKT-014-02', 400, `Chỉ có thể thao tác tối đa ${MAX_BULK} banner mỗi lần.`);
  const docs = await Promise.all(ids.map(load));
  if (docs.some((b) => bannerStatus(b, now) === 'VISIBLE')) {
    throw new AppError('E-MKT-014-01', 409, 'Vui lòng tạm ẩn banner trước khi xóa.');
  }
  await BannerModel.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: now } });
  logAdminAction(actorId, 'BANNER_DELETE', `${ids.length} banner`, { ids }, true);
  return { deleted: ids.length };
}

/** "Nhân bản sang vị trí khác": tạo bản nháp, không copy lượt xem. */
export async function duplicateBanner(actorId: string, id: string, position: BannerPosition, now = new Date()) {
  const b = await load(id);
  if ((b.position ?? 'HOME_SLIDER') === position) {
    throw new AppError('VALIDATION_ERROR', 400, 'Hãy chọn một vị trí khác với vị trí hiện tại.');
  }
  const last = await BannerModel.findOne({ code: /^BN\d{5}$/ }, 'code').sort({ code: -1 }).lean();
  const doc = await BannerModel.create({
    code: nextBannerCode(last?.code),
    position,
    title: b.title,
    content: b.content,
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl,
    ctaLabel: b.ctaLabel,
    linkUrl: b.linkUrl,
    openInNewTab: b.openInNewTab,
    startDate: now,
    endDate: null,
    displayOrder: 1,
    status: 'DRAFT',
    categoryIds: [],
    popupFrequency: position === 'POPUP' ? 'SESSION' : undefined,
  });
  logAdminAction(actorId, 'BANNER_DUPLICATE', b.code ?? id, { to: position });
  return getBanner(String(doc._id), now);
}

/** Kéo thả: gán thứ tự 1..n theo danh sách id trong cùng một vị trí. */
export async function reorderBanners(actorId: string, position: BannerPosition, ids: string[]) {
  const found = await BannerModel.countDocuments({ _id: { $in: ids }, ...alive, position: posQuery(position) });
  if (found !== ids.length) throw new AppError('VALIDATION_ERROR', 400, 'Danh sách banner không thuộc cùng một vị trí.');
  await BannerModel.bulkWrite(
    ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { displayOrder: i + 1 }, $inc: { version: 1 } } } })),
  );
  logAdminAction(actorId, 'BANNER_REORDER', position, { ids });
  return { reordered: ids.length };
}

/** Tải ảnh banner; trả URL, kích thước. Lỗi theo E-MKT-012-02/07. */
export async function uploadBannerImage(
  bytes: Uint8Array,
  position: BannerPosition,
  kind: 'desktop' | 'mobile',
): Promise<{ url: string; width: number; height: number }> {
  const format = detectFile(bytes);
  if (format.video) throw new AppError('E-MKT-012-02', 400, 'Banner chỉ nhận ảnh JPG, PNG hoặc WEBP.');
  let meta;
  try {
    meta = await sharp(Buffer.from(bytes), { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new AppError('E-MKT-012-07', 400, 'Tải ảnh không thành công. Vui lòng thử lại.');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  checkImage(kind, position, { width, height, bytes: bytes.length });
  const url = await uploadPublicFile(bytes, { folder: 'banners', ext: format.ext, contentType: format.mime });
  return { url, width, height };
}
