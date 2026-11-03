import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { detectFile } from '../../utils/file-upload.js';
import { ArticleModel, type ArticleDoc, type ArticleState } from '../articles/article.model.js';
import { logAdminAction } from './admin-log.js';
import {
  CATEGORIES,
  articleStatus,
  checkCover,
  checkLists,
  checkPinLimit,
  checkPublishable,
  checkSchedule,
  isValidSlug,
  nextArticleCode,
  sanitizeArticleHtml,
  slugify,
  type CreateArticleInput,
  type UpdateArticleInput,
} from './article-admin.rules.js';

const conflict = () => new AppError('E-COM-05', 409, 'Bài viết vừa được người khác cập nhật. Vui lòng tải lại.');
const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy bài viết');
const slugTaken = () => new AppError('E-MKT-016-02', 400, 'Đường dẫn bài viết đã tồn tại hoặc không hợp lệ.');

export const listQuerySchema = z.object({
  type: z.enum(['ARTICLE', 'ANNOUNCEMENT']).optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'HIDDEN']).optional(),
  category: z.enum(CATEGORIES).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [20, 50, 100].includes(n)).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

const toRow = (a: ArticleDoc, now: Date) => ({
  id: String(a._id),
  code: a.code,
  title: a.title,
  slug: a.slug ?? null,
  type: a.type,
  category: a.category ?? null,
  coverUrl: a.coverUrl ?? null,
  summary: a.summary ?? '',
  content: a.content ?? '',
  tags: a.tags,
  relatedProductIds: a.relatedProductIds.map(String),
  seoTitle: a.seoTitle ?? '',
  metaDescription: a.metaDescription ?? '',
  pinned: a.pinned,
  status: articleStatus(a, now),
  publishAt: a.publishAt ?? null,
  viewCount: a.viewCount,
  authorId: String(a.authorId),
  version: a.version,
  createdAt: a.createdAt,
});

const load = async (id: string): Promise<ArticleDoc> => {
  const a = Types.ObjectId.isValid(id) ? await ArticleModel.findById(id).lean() : null;
  if (!a) throw notFound();
  return a;
};

export async function listArticles(q: ListQuery, now = new Date()) {
  const find: Record<string, unknown> = {};
  if (q.type) find['type'] = q.type;
  if (q.category) find['category'] = q.category;
  const docs = await ArticleModel.find(find).sort({ createdAt: -1 }).lean();
  const needle = q.q?.toLowerCase();
  const rows = docs
    .map((a) => toRow(a, now))
    .filter((r) => (!q.status || r.status === q.status) && (!needle || r.title.toLowerCase().includes(needle)));
  const start = (q.page - 1) * q.pageSize;
  // Danh sách không cần nội dung đầy đủ.
  const items = rows.slice(start, start + q.pageSize).map(({ content: _c, ...r }) => r);
  return { items, total: rows.length, page: q.page, pageSize: q.pageSize };
}

export async function getArticle(id: string, now = new Date()) {
  return toRow(await load(id), now);
}

/** Slug đã bị bài khác dùng (kể cả làm slug cũ)? */
const slugUsed = async (slug: string, exceptId?: string) =>
  !!(await ArticleModel.exists({ _id: { $ne: exceptId ?? null }, $or: [{ slug }, { oldSlugs: slug }] }));

/** Slug tự sinh từ tiêu đề, thêm hậu tố `-2`, `-3`… nếu trùng. */
async function autoSlug(title: string, exceptId?: string): Promise<string | undefined> {
  const base = slugify(title);
  if (base.length < 5) return undefined;
  for (let i = 1; ; i++) {
    const s = i === 1 ? base : `${base.slice(0, 150)}-${i}`;
    if (!(await slugUsed(s, exceptId))) return s;
  }
}

async function save(actorId: string, input: CreateArticleInput | UpdateArticleInput, existing: ArticleDoc | null, now: Date) {
  const type = input.type;
  const tags = input.tags.map((t) => t.trim()).filter(Boolean);
  checkLists({ tags, relatedProductIds: input.relatedProductIds });
  if (input.relatedProductIds.some((p) => !Types.ObjectId.isValid(p))) {
    throw new AppError('E-COM-01', 400, 'Sản phẩm liên quan không hợp lệ.');
  }

  let slug = input.slug || existing?.slug;
  if (input.slug) {
    if (!isValidSlug(input.slug) || (await slugUsed(input.slug, existing ? String(existing._id) : undefined))) throw slugTaken();
  } else if (!slug) {
    slug = await autoSlug(input.title);
  }

  // Lưu nháp giữ nguyên trạng thái của bài đã đăng/ẩn; bài mới hoặc nháp vẫn là nháp.
  const keep: ArticleState = existing?.state ?? 'DRAFT';
  const target: ArticleState = input.action === 'DRAFT' ? keep : 'PUBLISHED';
  const content = input.content ? sanitizeArticleHtml(input.content) : undefined;
  const values = { ...input, slug, content, tags, type };
  if (target === 'PUBLISHED') checkPublishable(values);

  let publishAt = existing?.publishAt;
  if (input.action === 'SCHEDULE') publishAt = checkSchedule(input.publishAt, now);
  else if (input.action === 'PUBLISH') publishAt = now;

  const pinned = type === 'ANNOUNCEMENT' && input.pinned;
  if (target === 'PUBLISHED') {
    const others = await ArticleModel.countDocuments({
      _id: { $ne: existing?._id ?? null },
      type: 'ANNOUNCEMENT',
      pinned: true,
      state: 'PUBLISHED',
    });
    checkPinLimit(pinned, type, others);
  }

  const set: Record<string, unknown> = {
    title: input.title,
    slug,
    type,
    category: type === 'ARTICLE' ? (input.category ?? undefined) : undefined,
    coverUrl: input.coverUrl || undefined,
    summary: input.summary || undefined,
    content,
    tags,
    relatedProductIds: input.relatedProductIds,
    seoTitle: input.seoTitle || undefined,
    metaDescription: input.metaDescription || undefined,
    pinned,
    state: target,
    publishAt,
  };
  if (target === 'PUBLISHED' && !existing?.publishedAt) set['publishedAt'] = publishAt ?? now;
  // Bài đã đăng đổi slug: để lại chuyển hướng 301 từ đường dẫn cũ.
  let oldSlugs = existing?.oldSlugs ?? [];
  if (existing?.publishedAt && existing.slug && slug && slug !== existing.slug) {
    oldSlugs = [...new Set([...oldSlugs, existing.slug])];
  }
  set['oldSlugs'] = oldSlugs.filter((s) => s !== slug);

  if (!existing) {
    const last = await ArticleModel.findOne({}, 'code').sort({ code: -1 }).lean();
    const doc = await ArticleModel.create({ ...set, code: nextArticleCode(last?.code), authorId: actorId });
    logAdminAction(actorId, 'ARTICLE_CREATED', String(doc._id), { code: doc.code, state: target });
    if (target === 'PUBLISHED') logAdminAction(actorId, 'CONTENT_PUBLISHED', String(doc._id), { code: doc.code });
    return toRow(doc.toObject(), now);
  }
  const res = await ArticleModel.updateOne(
    { _id: existing._id, version: existing.version },
    { $set: set, $inc: { version: 1 } },
  );
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, 'ARTICLE_UPDATED', String(existing._id), { code: existing.code, state: target });
  if (target === 'PUBLISHED' && existing.state !== 'PUBLISHED') {
    logAdminAction(actorId, 'CONTENT_PUBLISHED', String(existing._id), { code: existing.code });
  }
  return getArticle(String(existing._id), now);
}

export const createArticle = (actorId: string, input: CreateArticleInput, now = new Date()) =>
  save(actorId, input, null, now);

export async function updateArticle(actorId: string, id: string, input: UpdateArticleInput, now = new Date()) {
  const existing = await load(id);
  if (existing.version !== input.version) throw conflict();
  return save(actorId, input, existing, now);
}

/** Ẩn (bài đã đăng/lên lịch) hoặc hiển thị lại (bài đã ẩn). Bài không bị xóa. */
export async function setHidden(actorId: string, id: string, hidden: boolean, now = new Date()) {
  const a = await load(id);
  const from: ArticleState = hidden ? 'PUBLISHED' : 'HIDDEN';
  if (a.state !== from) {
    throw new AppError('E-COM-01', 400, hidden ? 'Chỉ ẩn được bài đã đăng hoặc đã lên lịch.' : 'Bài viết này không ở trạng thái ẩn.');
  }
  if (!hidden) {
    const others = await ArticleModel.countDocuments({ _id: { $ne: a._id }, type: 'ANNOUNCEMENT', pinned: true, state: 'PUBLISHED' });
    checkPinLimit(a.pinned, a.type, others);
  }
  const res = await ArticleModel.updateOne(
    { _id: a._id, version: a.version },
    { $set: { state: hidden ? 'HIDDEN' : 'PUBLISHED' }, $inc: { version: 1 } },
  );
  if (!res.matchedCount) throw conflict();
  logAdminAction(actorId, hidden ? 'ARTICLE_HIDDEN' : 'ARTICLE_SHOWN', id, { code: a.code });
  return getArticle(id, now);
}

export async function uploadArticleCover(bytes: Uint8Array): Promise<{ url: string; width: number; height: number }> {
  const format = detectFile(bytes);
  if (format.video) throw new AppError('E-MKT-016-03', 400, 'Ảnh bìa chỉ nhận JPG, PNG hoặc WEBP.');
  let meta;
  try {
    meta = await sharp(Buffer.from(bytes), { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new AppError('E-MKT-016-03', 400, 'Tải ảnh không thành công. Vui lòng thử lại.');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  checkCover({ width, height, bytes: bytes.length });
  const name = `${randomUUID()}.${format.ext}`;
  const dir = path.resolve('uploads/articles');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes, { flag: 'wx' });
  return { url: `/uploads/articles/${name}`, width, height };
}
