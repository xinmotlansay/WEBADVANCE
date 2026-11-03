import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { detectFile } from '../../utils/file-upload.js';
import { ContentAreaModel, type ContentData, type ContentKey, type HomeData } from '../content/content.model.js';
import { ProductModel } from '../products/product.model.js';
import { logAdminAction } from './admin-log.js';
import {
  checkPublishable,
  checkSchedule,
  cleanText,
  defaultData,
  effectivePublished,
  featuredVisible,
  parseData,
  type SaveInput,
} from './content-admin.rules.js';

const conflict = () => new AppError('E-COM-05', 409, 'Nội dung vừa được người khác cập nhật. Vui lòng tải lại.');

/** Số sản phẩm Đang kinh doanh trong danh sách id (dùng cho khối nổi bật). */
export async function countActiveProducts(ids: string[]): Promise<number> {
  const valid = ids.filter((i) => Types.ObjectId.isValid(i));
  return valid.length ? ProductModel.countDocuments({ _id: { $in: valid }, status: 'ACTIVE' }) : 0;
}

const featuredIds = (d: ContentData | null): string[] =>
  d && 'blocks' in d ? (d.blocks.find((b) => b.type === 'FEATURED_PRODUCTS' && b.enabled)?.productIds ?? []) : [];

export async function getContent(key: ContentKey, now = new Date()) {
  const doc = await ContentAreaModel.findOne({ key }).lean();
  const published = effectivePublished(doc, now);
  const fresh = defaultData(key);
  const activeFeatured = await countActiveProducts(featuredIds(published));
  return {
    key,
    draft: doc?.draft ?? published ?? fresh,
    published,
    scheduledAt: doc?.scheduled && new Date(doc.scheduled.publishAt) > now ? doc.scheduled.publishAt : null,
    version: doc?.version ?? 0,
    updatedAt: doc?.updatedAt ?? null,
    warnings:
      featuredIds(published).length && !featuredVisible(activeFeatured)
        ? ['Khối Sản phẩm nổi bật đang tự ẩn vì còn dưới 4 sản phẩm đang kinh doanh.']
        : [],
  };
}

export async function saveContent(actorId: string, key: ContentKey, input: SaveInput, now = new Date()) {
  const { data, warning } = cleanText(key, parseData(key, input.data));
  let publishAt: Date | undefined;
  if (input.action !== 'DRAFT') {
    checkPublishable(key, data, await countActiveProducts(featuredIds(data)));
    if (input.action === 'SCHEDULE') publishAt = checkSchedule(input.publishAt, now);
  }

  // Tạo bản ghi nếu chưa có rồi cập nhật có điều kiện theo `version` (khóa lạc quan).
  await ContentAreaModel.updateOne({ key }, { $setOnInsert: { key, version: 0 } }, { upsert: true });
  const set: Record<string, unknown> = { draft: data, updatedBy: actorId };
  if (input.action === 'PUBLISH') Object.assign(set, { published: data, scheduled: null });
  if (input.action === 'SCHEDULE') set['scheduled'] = { data, publishAt };
  const res = await ContentAreaModel.updateOne({ key, version: input.version }, { $set: set, $inc: { version: 1 } });
  if (!res.matchedCount) throw conflict();

  logAdminAction(actorId, `CONTENT_${input.action}`, key, { publishAt });
  if (input.action !== 'DRAFT') logAdminAction(actorId, 'CONTENT_PUBLISHED', key, { scheduled: !!publishAt });
  return { ...(await getContent(key, now)), warning };
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

export type { HomeData };
