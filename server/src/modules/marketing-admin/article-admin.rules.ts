import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import type { ArticleState, ArticleType } from '../articles/article.model.js';

/** Quy tắc FR-MKT_AD-016. Hàm thuần để test không cần DB. */

export const CATEGORIES = ['Cảm hứng thiết kế', 'Mẹo bảo quản', 'Tin tức CaraVeso', 'Khác'] as const;
export const MAX_PINNED = 3;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
export const COVER_MIN = { w: 1200, h: 630 };
export const SCHEDULE_LEAD_MS = 5 * 60_000;

const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

export type ArticleStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'HIDDEN';

export const articleStatus = (a: { state: ArticleState; publishAt?: Date | null }, now = new Date()): ArticleStatus =>
  a.state === 'PUBLISHED' && a.publishAt && a.publishAt > now ? 'SCHEDULED' : a.state;

/** "Mẹo bảo quản đồ gỗ" → "meo-bao-quan-do-go". */
export const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);

export const isValidSlug = (s: string): boolean =>
  s.length >= 5 && s.length <= 160 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

export const nextArticleCode = (last?: string | null): string => {
  const n = last && /^BV\d{5}$/.test(last) ? Number(last.slice(2)) : 0;
  return `BV${String(n + 1).padStart(5, '0')}`;
};

const YOUTUBE = /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\/[\w-]{6,20}(\?[\w=&-]*)?$/;

/** Ranh giới tin cậy: nội dung do người soạn nhập, khách xem. Chỉ cho thẻ định dạng cơ bản + iframe YouTube. */
export const sanitizeArticleHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'iframe'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'title'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowProtocolRelative: false,
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'youtube.com'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
    // Chỉ chấp nhận đường dẫn nhúng /embed/…, không cho trang YouTube bất kỳ.
    exclusiveFilter: (f) => f.tag === 'iframe' && !YOUTUBE.test(f.attribs['src'] ?? ''),
  });

const fields = {
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề.').max(150),
  slug: z.string().trim().optional(),
  type: z.enum(['ARTICLE', 'ANNOUNCEMENT']).default('ARTICLE'),
  category: z.enum(CATEGORIES).nullish(),
  coverUrl: z.string().max(500).nullish(),
  summary: z.string().trim().max(300).nullish(),
  content: z.string().max(100_000).nullish(),
  tags: z.array(z.string().trim()).max(50).default([]),
  relatedProductIds: z.array(z.string()).max(50).default([]),
  seoTitle: z.string().trim().max(60).nullish(),
  metaDescription: z.string().trim().max(160).nullish(),
  pinned: z.boolean().default(false),
  /** Thao tác người dùng chọn: Lưu nháp / Đăng ngay / Lên lịch. */
  action: z.enum(['DRAFT', 'PUBLISH', 'SCHEDULE']).default('DRAFT'),
  publishAt: z.coerce.date().nullish(),
};
export const createArticleSchema = z.object(fields);
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
/** Sửa gửi lại cả form (kèm `version` cho khóa lạc quan). */
export const updateArticleSchema = z.object({ ...fields, version: z.number().int().min(0) });
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export interface ArticleValues {
  title: string;
  slug?: string | null;
  type: ArticleType;
  category?: string | null;
  coverUrl?: string | null;
  summary?: string | null;
  content?: string | null;
  tags: string[];
  relatedProductIds: string[];
}

const range = (name: string, v: string | null | undefined, min: number, max: number) => {
  const n = v?.length ?? 0;
  if (n < min || n > max) throw err('E-MKT-016-01', `${name} phải từ ${min} đến ${max} ký tự.`);
};

/** Thẻ và sản phẩm liên quan: kiểm cả khi lưu nháp. */
export function checkLists(v: Pick<ArticleValues, 'tags' | 'relatedProductIds'>): void {
  if (v.tags.length > 10 || v.relatedProductIds.length > 8) {
    throw err('E-MKT-016-06', 'Tối đa 10 thẻ và 8 sản phẩm liên quan.');
  }
  if (v.tags.some((t) => t.length < 2 || t.length > 30)) throw err('E-MKT-016-01', 'Mỗi thẻ phải từ 2 đến 30 ký tự.');
}

/** Đăng ngay / Lên lịch cần đủ trường (AC2); Lưu nháp chỉ cần tiêu đề. */
export function checkPublishable(v: ArticleValues): void {
  range('Tiêu đề', v.title, 10, 150);
  if (!v.slug || !isValidSlug(v.slug)) throw err('E-MKT-016-02', 'Đường dẫn bài viết đã tồn tại hoặc không hợp lệ.');
  if (v.type === 'ARTICLE' && !v.category) throw err('E-MKT-016-01', 'Vui lòng chọn chuyên mục.');
  if (!v.coverUrl) throw err('E-MKT-016-03', 'Ảnh bìa cần JPG, PNG, WEBP, tối đa 2 MB, tối thiểu 1200 × 630 px.');
  range('Tóm tắt', v.summary, 50, 300);
  range('Nội dung', v.content, 200, 50_000);
}

/** E-MKT-016-05. */
export function checkSchedule(publishAt: Date | null | undefined, now = new Date()): Date {
  if (!publishAt || publishAt.getTime() < now.getTime() + SCHEDULE_LEAD_MS) {
    throw err('E-MKT-016-05', 'Thời gian đăng phải sau thời điểm hiện tại ít nhất 5 phút.');
  }
  return publishAt;
}

/** E-MKT-016-04: `othersPinned` = số thông báo khác đang ghim (đã đăng). */
export function checkPinLimit(pinned: boolean, type: ArticleType, othersPinned: number): void {
  if (pinned && type === 'ANNOUNCEMENT' && othersPinned >= MAX_PINNED) {
    throw err('E-MKT-016-04', 'Chỉ được ghim tối đa 3 thông báo. Vui lòng bỏ ghim một thông báo khác.', 409);
  }
}

export function checkCover(img: { width: number; height: number; bytes: number }): void {
  if (img.bytes > MAX_COVER_BYTES || img.width < COVER_MIN.w || img.height < COVER_MIN.h) {
    throw err('E-MKT-016-03', 'Ảnh bìa cần JPG, PNG, WEBP, tối đa 2 MB, tối thiểu 1200 × 630 px.');
  }
}
