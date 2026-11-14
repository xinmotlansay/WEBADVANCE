import { z } from 'zod';
import { isStoredImageUrl } from '../../lib/supabase-storage.js';
import { AppError } from '../../utils/app-error.js';
import type { BannerPosition } from '../banners/banner.model.js';
import type { BannerStatus } from './effective-status.js';

/** Ảnh banner: file cũ `/uploads/banners/...` hoặc file đã lưu trên Supabase Storage. */
const isBannerImageUrl = (u: string): boolean =>
  (u.startsWith('/uploads/banners/') && !u.includes('..')) || isStoredImageUrl(u);

/** Quy tắc FR-MKT_AD-011→014. Hàm thuần để test không cần DB. */

export const POSITIONS = ['HOME_SLIDER', 'HOME_MIDDLE', 'CATEGORY', 'POPUP'] as const;

interface PositionRule {
  label: string;
  /** Số banner đang hiển thị tối đa; null = không giới hạn. */
  max: number | null;
  /** Kích thước tối thiểu ảnh desktop và ảnh mobile (px). */
  desktop: { w: number; h: number };
  mobile: { w: number; h: number };
  /** Tỉ lệ khuyến nghị của ảnh desktop (rộng / cao); sai lệch tối đa 5%. */
  ratio: number;
  recommended: string;
}

export const POSITION_RULES: Record<BannerPosition, PositionRule> = {
  HOME_SLIDER: { label: 'Slider trang chủ', max: 8, desktop: { w: 1440, h: 750 }, mobile: { w: 750, h: 750 }, ratio: 1920 / 1000, recommended: '1920 × 1000' },
  HOME_MIDDLE: { label: 'Banner giữa trang chủ', max: 3, desktop: { w: 1200, h: 400 }, mobile: { w: 750, h: 400 }, ratio: 3, recommended: '1200 × 400' },
  CATEGORY: { label: 'Banner trang danh mục', max: null, desktop: { w: 1200, h: 300 }, mobile: { w: 750, h: 400 }, ratio: 4, recommended: '1200 × 300' },
  POPUP: { label: 'Popup', max: 1, desktop: { w: 600, h: 600 }, mobile: { w: 750, h: 750 }, ratio: 1, recommended: '600 × 600' },
};

export const MAX_DESKTOP_BYTES = 2 * 1024 * 1024;
export const MAX_MOBILE_BYTES = 1024 * 1024;
export const MAX_BULK = 20;
const RATIO_TOLERANCE = 0.05;

const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

/** E-MKT-012-02: định dạng (đã kiểm ở tầng upload), dung lượng, kích thước, tỉ lệ. */
export function checkImage(
  kind: 'desktop' | 'mobile',
  position: BannerPosition,
  img: { width: number; height: number; bytes: number },
): void {
  const rule = POSITION_RULES[position];
  const min = kind === 'desktop' ? rule.desktop : rule.mobile;
  const limit = kind === 'desktop' ? MAX_DESKTOP_BYTES : MAX_MOBILE_BYTES;
  const base = `Ảnh ${kind === 'desktop' ? 'desktop' : 'mobile'} cho vị trí ${rule.label} cần định dạng JPG, PNG, WEBP, tối đa ${limit / 1024 / 1024} MB, tối thiểu ${min.w} × ${min.h} px`;
  if (img.bytes > limit || img.width < min.w || img.height < min.h) {
    throw err('E-MKT-012-02', `${base}.`);
  }
  if (kind === 'desktop' && Math.abs(img.width / img.height - rule.ratio) / rule.ratio > RATIO_TOLERANCE) {
    throw err('E-MKT-012-02', `${base} và tỉ lệ gần ${rule.recommended} (sai lệch tối đa 5%).`);
  }
}

/** E-MKT-012-03: đường dẫn nội bộ bắt đầu bằng "/" (không phải "//") hoặc URL https://. */
export const isValidLink = (u: string): boolean =>
  u.length <= 500 && ((u.startsWith('/') && !u.startsWith('//')) || /^https:\/\/[^\s]+$/.test(u));

export const isExternalLink = (u: string): boolean => u.startsWith('https://');

/** Slug sản phẩm nếu liên kết nội bộ trỏ tới `/products/<slug>`. */
export function productSlugOf(link?: string | null): string | null {
  const m = /^\/products\/([^/?#]+)/.exec(link ?? '');
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

const fields = {
  position: z.enum(POSITIONS),
  title: z.string().trim().min(5, 'Tiêu đề từ 5 đến 100 ký tự.').max(100, 'Tiêu đề từ 5 đến 100 ký tự.'),
  content: z.string().trim().max(200).optional(),
  imageUrl: z.string().refine(isBannerImageUrl, 'Ảnh banner không hợp lệ.'),
  mobileImageUrl: z.string().refine(isBannerImageUrl, 'Ảnh banner không hợp lệ.').nullish(),
  ctaLabel: z.string().trim().min(2).max(20).nullish(),
  linkUrl: z.string().trim().nullish(),
  openInNewTab: z.boolean().optional(),
  startNow: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullish(),
  displayOrder: z.number().int().min(1).max(99).default(1),
  categoryIds: z.array(z.string()).max(20).optional(),
  popupFrequency: z.enum(['SESSION', 'DAILY', 'ONCE']).optional(),
  /** true = Đăng, false = Lưu nháp. */
  publish: z.boolean().default(false),
};

export const createBannerSchema = z.object(fields);
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

export const updateBannerSchema = z
  .object({ ...fields, displayOrder: fields.displayOrder.optional(), publish: z.boolean().optional() })
  .omit({ position: true })
  .partial()
  .extend({ version: z.number().int().min(0) });
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const reorderSchema = z.object({ position: z.enum(POSITIONS), ids: z.array(z.string()).min(1).max(99) });
export const idsSchema = z.object({ ids: z.array(z.string()).min(1) });
export const duplicateSchema = z.object({ position: z.enum(POSITIONS) });

/** Kiểm tra chéo giữa các trường (E-MKT-012-01/03/06 và điều kiện theo vị trí). */
export function checkBannerValues(
  v: {
    position: BannerPosition;
    linkUrl?: string | null;
    ctaLabel?: string | null;
    categoryIds?: string[];
    popupFrequency?: string;
  },
  startDate: Date,
  endDate?: Date | null,
): void {
  if (v.linkUrl && !isValidLink(v.linkUrl)) {
    throw err('E-MKT-012-03', 'Liên kết phải bắt đầu bằng "/" (nội bộ) hoặc "https://".');
  }
  if (v.ctaLabel && !v.linkUrl) {
    throw err('E-MKT-012-06', `Vui lòng nhập liên kết cho nút ${v.ctaLabel}.`);
  }
  if (v.position === 'CATEGORY' && !(v.categoryIds?.length)) {
    throw err('E-MKT-012-01', 'Banner trang danh mục cần chọn từ 1 đến 20 danh mục áp dụng.');
  }
  if (v.position === 'POPUP' && !v.popupFrequency) {
    throw err('E-MKT-012-01', 'Popup cần chọn tần suất hiển thị.');
  }
  if (endDate && endDate <= startDate) {
    throw err('E-MKT-012-01', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
  }
}

/** E-MKT-012-04 / E-MKT-013-03: vị trí đã đủ banner đang hiển thị. */
export function checkCapacity(position: BannerPosition, visibleNow: number): void {
  const { max, label } = POSITION_RULES[position];
  if (max !== null && visibleNow >= max) {
    throw err('E-MKT-012-04', `Vị trí ${label} đã đủ ${max} banner đang hiển thị. Vui lòng ẩn bớt banner hoặc lên lịch hiển thị sau.`, 409);
  }
}

/** Thứ tự mặc định (FR-011): Đang hiển thị → Đã lên lịch → Tạm ẩn → Nháp → Hết hạn. */
const RANK: Record<BannerStatus, number> = { VISIBLE: 0, SCHEDULED: 1, HIDDEN: 2, DRAFT: 3, EXPIRED: 4 };
export const sortBanners = <T extends { status: BannerStatus; displayOrder: number; createdAt?: Date }>(rows: T[]): T[] =>
  [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      a.displayOrder - b.displayOrder ||
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );

export const ctr = (impressions: number, clicks: number): number | null => (impressions > 0 ? clicks / impressions : null);

/** Mã kế tiếp `BN` + 5 chữ số từ mã lớn nhất hiện có. */
export const nextBannerCode = (last?: string | null): string => {
  const n = last && /^BN\d{5}$/.test(last) ? Number(last.slice(2)) : 0;
  return `BN${String(n + 1).padStart(5, '0')}`;
};
