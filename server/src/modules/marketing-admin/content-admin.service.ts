import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { detectFile } from '../../utils/file-upload.js';
import { ContentAreaModel, type AreaKey, type ContentData, type ContentKey, type ContentVersion } from '../content/content.model.js';
import { ProductModel } from '../products/product.model.js';
import { logAdminAction } from './admin-log.js';
import {
  applyRestore,
  checkLandingName,
  checkPublishable,
  checkSchedule,
  cleanText,
  defaultData,
  effectivePublished,
  featuredVisible,
  isValidLpSlug,
  kindOf,
  lpKey,
  parseData,
  pushVersion,
  type SaveInput,
} from './content-admin.rules.js';

const conflict = () => new AppError('E-COM-05', 409, 'Nội dung vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy nội dung');
const isLp = (key: AreaKey) => key.startsWith('LP:');

/** Số sản phẩm Đang kinh doanh trong danh sách id (dùng cho khối nổi bật). */
export async function countActiveProducts(ids: string[]): Promise<number> {
  const valid = ids.filter((i) => Types.ObjectId.isValid(i));
  return valid.length ? ProductModel.countDocuments({ _id: { $in: valid }, status: 'ACTIVE' }) : 0;
}

const featuredIds = (d: ContentData | null): string[] =>
  d && 'blocks' in d ? (d.blocks.find((b) => b.type === 'FEATURED_PRODUCTS' && b.enabled)?.productIds ?? []) : [];

export async function getContent(key: AreaKey, now = new Date()) {
  const doc = await ContentAreaModel.findOne({ key }).lean();
  if (isLp(key) && !doc) throw notFound();
  const published = effectivePublished(doc, now);
  const activeFeatured = await countActiveProducts(featuredIds(published));
  return {
    key,
    draft: doc?.draft ?? published ?? defaultData(kindOf(key)),
    published,
    scheduledAt: doc?.scheduled && new Date(doc.scheduled.publishAt) > now ? doc.scheduled.publishAt : null,
    version: doc?.version ?? 0,
    updatedAt: doc?.updatedAt ?? null,
    name: doc?.name ?? '',
    seoTitle: doc?.seoTitle ?? '',
    metaDescription: doc?.metaDescription ?? '',
    hidden: doc?.hidden ?? false,
    warnings:
      featuredIds(published).length && !featuredVisible(activeFeatured)
        ? ['Khối Sản phẩm nổi bật đang tự ẩn vì còn dưới 4 sản phẩm đang kinh doanh.']
        : [],
  };
}

export interface LandingMeta {
  name?: string;
  seoTitle?: string;
  metaDescription?: string;
}

export async function saveContent(actorId: string, key: AreaKey, input: SaveInput, meta: LandingMeta = {}, now = new Date()) {
  const { data, warning } = cleanText(kindOf(key), parseData(kindOf(key), input.data));
  const existing = isLp(key) ? await ContentAreaModel.findOne({ key }, 'name').lean() : null;
  if (isLp(key) && !existing) throw notFound();

  let publishAt: Date | undefined;
  if (input.action !== 'DRAFT') {
    checkPublishable(kindOf(key), data, await countActiveProducts(featuredIds(data)));
    if (isLp(key)) checkLandingName(meta.name ?? existing?.name);
    if (input.action === 'SCHEDULE') publishAt = checkSchedule(input.publishAt, now);
  }

  // Tạo bản ghi nếu chưa có (HOME / thanh thông báo) rồi cập nhật có điều kiện theo `version` (khóa lạc quan).
  if (!isLp(key)) await ContentAreaModel.updateOne({ key }, { $setOnInsert: { key, version: 0 } }, { upsert: true });
  const set: Record<string, unknown> = { draft: data, updatedBy: actorId };
  if (isLp(key)) {
    for (const k of ['name', 'seoTitle', 'metaDescription'] as const) if (meta[k] !== undefined) set[k] = meta[k];
  }
  if (input.action === 'PUBLISH') Object.assign(set, { published: data, scheduled: null });
  if (input.action === 'SCHEDULE') set['scheduled'] = { data, publishAt };
  if (input.action !== 'DRAFT') {
    // Mỗi lần đăng / hẹn đăng lưu một phiên bản, giữ 10 bản gần nhất.
    const cur = await ContentAreaModel.findOne({ key }, 'versions').lean();
    const v: ContentVersion = { id: input.version, data, savedAt: now, by: actorId, action: input.action };
    set['versions'] = pushVersion(cur?.versions, v);
  }
  const res = await ContentAreaModel.updateOne({ key, version: input.version }, { $set: set, $inc: { version: 1 } });
  if (!res.matchedCount) throw conflict();

  logAdminAction(actorId, `CONTENT_${input.action}`, key, { publishAt });
  if (input.action !== 'DRAFT') logAdminAction(actorId, 'CONTENT_PUBLISHED', key, { scheduled: !!publishAt });
  return { ...(await getContent(key, now)), warning };
}

/** Danh sách phiên bản (mới nhất trước), không kèm dữ liệu. */
export async function listVersions(key: AreaKey) {
  const doc = await ContentAreaModel.findOne({ key }, 'versions').lean();
  if (isLp(key) && !doc) throw notFound();
  return [...(doc?.versions ?? [])].reverse().map((v) => ({ id: v.id, savedAt: v.savedAt, action: v.action, by: v.by ?? null }));
}

/** Khôi phục thành bản nháp mới; không đụng bản đang đăng (AC5). */
export async function restoreVersion(actorId: string, key: AreaKey, id: number, version: number) {
  const doc = await ContentAreaModel.findOne({ key }, 'versions draft').lean();
  if (!doc) throw notFound();
  const { draft } = applyRestore(doc, id);
  const res = await ContentAreaModel.updateOne({ key, version }, { $set: { draft, updatedBy: actorId }, $inc: { version: 1 } });
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, 'CONTENT_RESTORED', key, { versionId: id });
  return getContent(key);
}

// ---- Landing page ----

export async function listLandingPages(now = new Date()) {
  const docs = await ContentAreaModel.find({ key: /^LP:/ }).sort({ updatedAt: -1 }).lean();
  return docs.map((d) => {
    const slug = d.key.slice(3);
    const published = effectivePublished(d, now);
    const scheduled = !!d.scheduled && new Date(d.scheduled.publishAt) > now;
    return {
      slug,
      name: d.name ?? slug,
      status: d.hidden ? 'HIDDEN' : published ? 'PUBLISHED' : scheduled ? 'SCHEDULED' : 'DRAFT',
      updatedAt: d.updatedAt ?? null,
    };
  });
}

export async function createLandingPage(actorId: string, name: string, slug: string) {
  if (!isValidLpSlug(slug)) {
    throw new AppError('E-MKT-015-02', 400, 'Đường dẫn landing page đã tồn tại hoặc không hợp lệ.');
  }
  checkLandingName(name);
  try {
    await ContentAreaModel.create({ key: lpKey(slug), name, draft: defaultData('HOME'), updatedBy: actorId });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      throw new AppError('E-MKT-015-02', 400, 'Đường dẫn landing page đã tồn tại hoặc không hợp lệ.');
    }
    throw e;
  }
  logAdminAction(actorId, 'LANDING_CREATED', slug);
  return getContent(lpKey(slug));
}

/** Ẩn / hiển thị lại landing page (không xóa). */
export async function setLandingHidden(actorId: string, slug: string, hidden: boolean) {
  const res = await ContentAreaModel.updateOne({ key: lpKey(slug) }, { $set: { hidden } });
  if (!res.matchedCount) throw notFound();
  logAdminAction(actorId, hidden ? 'LANDING_HIDDEN' : 'LANDING_SHOWN', slug);
  return getContent(lpKey(slug));
}

/** Ảnh trong khối: JPG/PNG/WEBP, tối đa 2 MB (E-MKT-015-06). */
export async function uploadContentImage(bytes: Uint8Array): Promise<{ url: string }> {
  const format = detectFile(bytes);
  if (format.video || bytes.length > 2 * 1024 * 1024) {
    throw new AppError('E-MKT-015-06', 400, 'Ảnh chấp nhận JPG, PNG, WEBP, tối đa 2 MB và cần văn bản thay thế.');
  }
  const name = `${randomUUID()}.${format.ext}`;
  const dir = path.resolve('uploads/content');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes, { flag: 'wx' });
  return { url: `/uploads/content/${name}` };
}

/** Cảnh báo cho Dashboard (AC4): khối nổi bật đang đăng nhưng không đủ 4 sản phẩm hiển thị. */
export async function homeWarnings(now = new Date()): Promise<{ kind: string; text: string; link: string }[]> {
  const doc = await ContentAreaModel.findOne({ key: 'HOME' }).lean();
  const ids = featuredIds(effectivePublished(doc, now));
  if (!ids.length || featuredVisible(await countActiveProducts(ids))) return [];
  return [{ kind: 'HOME_FEATURED_LOW', text: 'Khối Sản phẩm nổi bật trên trang chủ đã tự ẩn: còn dưới 4 sản phẩm đang kinh doanh', link: 'noi-dung' }];
}

export type { ContentKey };
