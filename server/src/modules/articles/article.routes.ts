import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendData } from '../../utils/response.js';
import { sanitizeArticleHtml } from '../marketing-admin/article-admin.rules.js';
import { ProductModel } from '../products/product.model.js';
import { ArticleModel } from './article.model.js';

/** Tin tức phía khách: chỉ bài đã đăng và đã đến giờ đăng. Bài ẩn / nháp / chưa đến giờ → 404. */
export const articleRoutes = Router();

const visible = (now: Date) => ({ state: 'PUBLISHED' as const, $or: [{ publishAt: null }, { publishAt: { $lte: now } }] });

const querySchema = z.object({
  type: z.enum(['ARTICLE', 'ANNOUNCEMENT']).optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

articleRoutes.get(
  '/',
  validateQuery(querySchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals['query'] as z.infer<typeof querySchema>;
    const find = { ...visible(new Date()), ...(q.type && { type: q.type }), ...(q.category && { category: q.category }) };
    const [docs, total] = await Promise.all([
      ArticleModel.find(find, '-content -oldSlugs -authorId')
        .sort({ pinned: -1, publishAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      ArticleModel.countDocuments(find),
    ]);
    sendData(res, {
      items: docs.map((a) => ({
        slug: a.slug,
        title: a.title,
        type: a.type,
        category: a.category ?? null,
        coverUrl: a.coverUrl ?? null,
        summary: a.summary ?? '',
        pinned: a.pinned,
        publishAt: a.publishAt ?? a.publishedAt ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  }),
);

articleRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params['slug']);
    const a = await ArticleModel.findOneAndUpdate({ slug, ...visible(new Date()) }, { $inc: { viewCount: 1 } }, { new: true }).lean();
    if (!a) {
      // Đổi slug của bài đã đăng: 301 sang đường dẫn mới (chỉ khi bài còn hiển thị).
      const moved = await ArticleModel.findOne({ oldSlugs: slug, ...visible(new Date()) }, 'slug').lean();
      if (!moved?.slug) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy bài viết');
      res.redirect(301, `${req.baseUrl}/${moved.slug}`);
      return;
    }
    // Sản phẩm liên quan bị ẩn / ngừng kinh doanh tự không hiển thị.
    const related = a.relatedProductIds.length
      ? await ProductModel.find({ _id: { $in: a.relatedProductIds }, status: 'ACTIVE' }, 'name slug').lean()
      : [];
    sendData(res, {
      slug: a.slug,
      title: a.title,
      type: a.type,
      category: a.category ?? null,
      coverUrl: a.coverUrl ?? null,
      summary: a.summary ?? '',
      // Lọc lại khi trả cho khách: bài nhập thẳng vào DB (seed, script) không qua bộ lọc lúc lưu,
      // và client hiển thị trường này bằng innerHTML không qua bộ lọc của Angular (để giữ iframe YouTube).
      content: sanitizeArticleHtml(a.content ?? ''),
      tags: a.tags,
      seoTitle: a.seoTitle || a.title,
      metaDescription: a.metaDescription || a.summary || '',
      publishAt: a.publishAt ?? a.publishedAt ?? null,
      relatedProducts: related.map((p) => ({ id: String(p._id), name: p.name, slug: p.slug })),
    });
  }),
);
