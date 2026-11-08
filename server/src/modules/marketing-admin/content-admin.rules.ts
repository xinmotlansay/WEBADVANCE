import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import type { AreaKey, BarData, ContentAreaDoc, ContentData, ContentKey, ContentVersion, HomeBlock, HomeBlockType, HomeData } from '../content/content.model.js';
import { isValidLink } from './banner-admin.rules.js';

/** Quy tắc FR-MKT_AD-015 (trang chủ, thanh thông báo). Hàm thuần để test không cần DB. */

export const BLOCK_TYPES: HomeBlockType[] = ['COLLECTIONS', 'PROMOTION'];
export const BLOCK_LABEL: Record<HomeBlockType, string> = {
  COLLECTIONS: 'Collection',
  PROMOTION: 'Khuyến mãi',
};
export const SCHEDULE_LEAD_MS = 5 * 60_000;

const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

const blockSchema = z.object({
  type: z.enum(BLOCK_TYPES as [HomeBlockType, ...HomeBlockType[]]),
  enabled: z.boolean().default(false),
  title: z.string().trim().max(80).default(''),
  text: z.string().max(2000).default(''),
  imageUrl: z.string().max(500).default(''),
  imageAlt: z.string().trim().max(100).default(''),
  ctaLabel: z.string().trim().max(30).default(''),
  ctaUrl: z.string().trim().max(500).default(''),
  productIds: z.array(z.string()).max(50).default([]),
  categoryIds: z.array(z.string()).max(50).default([]),
  collectionIds: z.array(z.string()).max(20).default([]),
  promotionIds: z.array(z.string()).max(20).default([]),
});
/** Bản lưu cũ có thể còn khối không còn trên trang chủ (giới thiệu, nổi bật, bài viết): bỏ qua. */
const dropLegacy = (raw: unknown) =>
  raw && typeof raw === 'object' && Array.isArray((raw as { blocks?: unknown }).blocks)
    ? { ...raw, blocks: (raw as { blocks: { type?: unknown }[] }).blocks.filter((b) => BLOCK_TYPES.includes(b?.type as HomeBlockType)) }
    : raw;
export const homeSchema = z.preprocess(dropLegacy, z.object({ blocks: z.array(blockSchema).max(BLOCK_TYPES.length) }));
export const barSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().trim().max(120).default(''),
  linkUrl: z.string().trim().max(500).default(''),
  startAt: z.string().default(''),
  endAt: z.string().default(''),
});

export const saveSchema = z.object({
  data: z.unknown(),
  action: z.enum(['DRAFT', 'PUBLISH', 'SCHEDULE']).default('DRAFT'),
  publishAt: z.coerce.date().nullish(),
  version: z.number().int().min(0),
});
export type SaveInput = z.infer<typeof saveSchema>;

export const emptyBlock = (type: HomeBlockType): HomeBlock => ({
  type, enabled: false, title: '', text: '', imageUrl: '', imageAlt: '', ctaLabel: '', ctaUrl: '',
  productIds: [], categoryIds: [], collectionIds: [], promotionIds: [],
});
export const defaultData = (key: ContentKey): ContentData =>
  key === 'HOME'
    ? { blocks: BLOCK_TYPES.map(emptyBlock) }
    : { enabled: false, text: '', linkUrl: '', startAt: '', endAt: '' };

/** Đảm bảo đủ các khối của trang chủ, mỗi loại đúng một lần; khối thiếu thêm vào cuối ở trạng thái tắt. */
export function normalizeHome(d: HomeData): HomeData {
  const seen = new Set<HomeBlockType>();
  const blocks = d.blocks.filter((b) => BLOCK_TYPES.includes(b.type) && !seen.has(b.type) && seen.add(b.type));
  return { blocks: [...blocks, ...BLOCK_TYPES.filter((t) => !seen.has(t)).map(emptyBlock)] };
}

export function parseData(key: ContentKey, raw: unknown): ContentData {
  return key === 'HOME' ? normalizeHome(homeSchema.parse(raw) as HomeData) : (barSchema.parse(raw) as BarData);
}

/** Bản đang hiển thị: bản hẹn giờ đã đến giờ thay bản đã đăng. */
export function effectivePublished(doc: Pick<ContentAreaDoc, 'published' | 'scheduled'> | null, now = new Date()): ContentData | null {
  if (doc?.scheduled && new Date(doc.scheduled.publishAt) <= now) return doc.scheduled.data;
  return doc?.published ?? null;
}

const range = (name: string, v: string, min: number, max: number) => {
  if (v.length < min || v.length > max) throw err('E-MKT-015-01', `${name} phải từ ${min} đến ${max} ký tự.`);
};

/** Bỏ thẻ HTML khỏi văn bản thuần; trả thêm cờ để cảnh báo E-MKT-015-05. */
export function stripTags(s: string): { text: string; changed: boolean } {
  const text = s.replace(/<[^>]*>/g, '');
  return { text, changed: text !== s };
}

/** Xóa thẻ HTML trong mọi trường văn bản; trả cảnh báo nếu có gì bị bỏ. */
export function cleanText(key: ContentKey, d: ContentData): { data: ContentData; warning: string | null } {
  let changed = false;
  const clean = (s: string) => {
    const r = stripTags(s);
    changed ||= r.changed;
    return r.text;
  };
  const data =
    key === 'HOME'
      ? { blocks: (d as HomeData).blocks.map((b) => ({ ...b, title: clean(b.title), text: clean(b.text), imageAlt: clean(b.imageAlt), ctaLabel: clean(b.ctaLabel) })) }
      : { ...(d as BarData), text: clean((d as BarData).text) };
  return { data, warning: changed ? 'Một số mã HTML không được phép đã bị loại bỏ khỏi nội dung.' : null };
}

/** Kiểm tra khi Đăng ngay / Lên lịch. */
export function checkPublishable(key: ContentKey, d: ContentData): void {
  if (key === 'ANNOUNCEMENT_BAR') {
    const b = d as BarData;
    if (!b.enabled) return;
    range('Nội dung thanh thông báo', b.text, 5, 120);
    if (b.linkUrl && !isValidLink(b.linkUrl)) throw err('E-MKT-015-01', 'Liên kết phải bắt đầu bằng "/" (nội bộ) hoặc "https://".');
    if (b.startAt && b.endAt && new Date(b.endAt) <= new Date(b.startAt)) {
      throw err('E-MKT-015-01', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
    }
    return;
  }
  for (const b of (d as HomeData).blocks) {
    if (!b.enabled) continue;
    const label = BLOCK_LABEL[b.type];
    range(`Tiêu đề khối ${label}`, b.title, 2, 80);
    if (b.imageUrl) range('Văn bản thay thế của ảnh', b.imageAlt, 5, 100);
    if (b.ctaUrl && !isValidLink(b.ctaUrl)) throw err('E-MKT-015-01', `Liên kết nút của khối ${label} phải bắt đầu bằng "/" hoặc "https://".`);
    if (b.type === 'COLLECTIONS' && !b.collectionIds?.length) throw err('E-MKT-015-01', 'Khối Collection cần chọn ít nhất 1 collection.');
    if (b.type === 'PROMOTION' && !b.promotionIds.length) throw err('E-MKT-015-01', 'Khối Khuyến mãi cần chọn ít nhất 1 chương trình.');
  }
}

/** Tile của khối Collection: ảnh đại diện (không chọn → ảnh đầu theo thứ tự), link trang collection. */
export function collectionTile(c: { _id: unknown; name: string; slug: string; images: { url: string; isThumbnail: boolean; displayOrder: number }[] }) {
  const images = [...c.images].sort((a, b) => a.displayOrder - b.displayOrder);
  const thumb = images.find((i) => i.isThumbnail) ?? images[0];
  return { id: String(c._id), name: c.name, slug: c.slug, imageUrl: thumb?.url ?? '', link: `/collections/${c.slug}` };
}

/** E-MKT-015-04. */
export function checkSchedule(publishAt: Date | null | undefined, now = new Date()): Date {
  if (!publishAt || publishAt.getTime() < now.getTime() + SCHEDULE_LEAD_MS) {
    throw err('E-MKT-015-04', 'Thời gian đăng phải sau thời điểm hiện tại ít nhất 5 phút.');
  }
  return publishAt;
}

/** Thanh thông báo có đang hiển thị lúc `now` không. */
export const barVisible = (b: BarData | null, now = new Date()): boolean =>
  !!b?.enabled &&
  !!b.text &&
  (!b.startAt || new Date(b.startAt) <= now) &&
  (!b.endAt || new Date(b.endAt) > now);

// ---- Landing page và lịch sử phiên bản (M13) ----

export const MAX_VERSIONS = 10;
export const lpKey = (slug: string): AreaKey => `LP:${slug}`;
/** Cấu trúc dữ liệu của khu vực: landing page dùng chung cấu trúc khối với trang chủ. */
export const kindOf = (key: AreaKey): ContentKey => (key === 'ANNOUNCEMENT_BAR' ? 'ANNOUNCEMENT_BAR' : 'HOME');

/** E-MKT-015-02: 3–80 ký tự, chữ thường không dấu, số, `-`. */
export const isValidLpSlug = (s: string): boolean => s.length >= 3 && s.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

export const createLandingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim(),
});
export const landingMetaSchema = z.object({
  name: z.string().trim().max(100).optional(),
  seoTitle: z.string().trim().max(60).optional(),
  metaDescription: z.string().trim().max(160).optional(),
});

export function checkLandingName(name: string | undefined): void {
  range('Tên landing page', name ?? '', 5, 100);
}

/** Thêm một phiên bản và chỉ giữ `MAX_VERSIONS` bản gần nhất (cũ → mới). */
export const pushVersion = (versions: ContentVersion[] | undefined, v: ContentVersion): ContentVersion[] =>
  [...(versions ?? []), v].slice(-MAX_VERSIONS);

/**
 * Khôi phục: phiên bản cũ trở thành bản nháp mới, bản đang đăng và bản hẹn giờ giữ nguyên (AC5).
 */
export function applyRestore<T extends Pick<ContentAreaDoc, 'versions' | 'draft'>>(area: T, id: number): T {
  const v = area.versions?.find((x) => x.id === id);
  if (!v) throw err('NOT_FOUND', 'Không tìm thấy phiên bản này.', 404);
  return { ...area, draft: v.data };
}
