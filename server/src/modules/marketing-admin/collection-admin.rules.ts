import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';

/** Quy tắc MA-07 (Collection). Hàm thuần để test không cần DB. */

export const MAX_PRODUCTS = 100;
/** 1 ảnh chính + 3 ảnh phụ. */
export const MAX_IMAGES = 4;
export const MAX_HOTSPOTS = 8;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 800;

const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

/** Khác slug bài viết: collection có tên ngắn ("ODA" → "oda") nên cho từ 2 ký tự. */
export const isValidCollectionSlug = (s: string): boolean =>
  s.length >= 2 && s.length <= 160 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

/** Ảnh tải lên (`/uploads/...`) hoặc ảnh https sẵn có (dữ liệu seed). Chặn `//host`, `javascript:`. */
export const imageUrl = z
  .string()
  .max(500)
  .refine((u) => (/^\/uploads\/[\w./-]+$/.test(u) && !u.includes('..')) || /^https:\/\/[^\s]+$/.test(u), 'Đường dẫn ảnh không hợp lệ.');

const hotspotSchema = z.object({
  productId: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
const imageSchema = z.object({
  url: imageUrl,
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(500).default(''),
  isThumbnail: z.boolean().default(false),
  hotspots: z.array(hotspotSchema).max(MAX_HOTSPOTS, `Mỗi ảnh tối đa ${MAX_HOTSPOTS} điểm sản phẩm.`).default([]),
});
export type ImageInput = z.infer<typeof imageSchema>;

const fields = {
  name: z.string().trim().min(2, 'Tên phải từ 2 đến 120 ký tự.').max(120, 'Tên phải từ 2 đến 120 ký tự.'),
  slug: z.string().trim().optional(),
  slogan: z.string().trim().max(120).default(''),
  shortDescription: z.string().trim().max(255).default(''),
  description: z.string().trim().max(5000).default(''),
  productIds: z.array(z.string()).max(MAX_PRODUCTS).default([]),
  /** Bỏ trống khi sửa = giữ nguyên ảnh hiện có. */
  images: z.array(imageSchema).max(MAX_IMAGES, `Tối đa ${MAX_IMAGES} ảnh.`).optional(),
};
export const createCollectionSchema = z.object(fields);
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
/** Sửa gửi lại cả form, kèm `version` cho khóa lạc quan. */
export const updateCollectionSchema = z.object({ ...fields, version: z.number().int().min(0) });
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export const reorderSchema = z.object({ ids: z.array(z.string()).min(1).max(200) });

/** Bỏ trùng, giữ thứ tự người chọn. */
export function normalizeProductIds(ids: string[]): string[] {
  if (ids.some((id) => !Types.ObjectId.isValid(id))) throw err('E-COM-01', 'Sản phẩm không hợp lệ.');
  return [...new Set(ids)];
}

/** E-MKT-020-02: khách không được thấy collection rỗng. */
export function checkPublishable(c: { images: number; products: number }): void {
  if (c.images < 1 || c.products < 1) {
    throw err('E-MKT-020-02', 'Cần ít nhất 1 ảnh và 1 sản phẩm trước khi hiển thị bộ sưu tập.');
  }
}

/** E-MKT-020-03: giống banner, ẩn trước rồi mới xóa để tránh xóa nhầm thứ khách đang xem. */
export function checkDeletable(status: 'VISIBLE' | 'HIDDEN'): void {
  if (status === 'VISIBLE') throw err('E-MKT-020-03', 'Vui lòng ẩn bộ sưu tập trước khi xóa.', 409);
}

/** E-MKT-020-04. */
export function checkCollectionImage(img: { width: number; height: number; bytes: number }): void {
  if (img.bytes > MAX_IMAGE_BYTES || Math.min(img.width, img.height) < MIN_IMAGE_SIDE) {
    throw err('E-MKT-020-04', `Ảnh cần JPG, PNG hoặc WEBP, tối đa 3 MB, cạnh ngắn tối thiểu ${MIN_IMAGE_SIDE} px.`);
  }
}

/** Đúng 1 ảnh đại diện (cái được chọn đầu tiên, không chọn → ảnh đầu); thứ tự theo vị trí trong mảng. */
export function normalizeImages(images: ImageInput[]) {
  const thumb = Math.max(0, images.findIndex((i) => i.isThumbnail));
  return images.map((i, index) => ({ ...i, isThumbnail: index === thumb, displayOrder: index + 1 }));
}

/** Sản phẩm gắn trên hotspot luôn có trong danh sách bên dưới ảnh (thêm vào cuối). */
export function withHotspotProducts(productIds: string[], images: Pick<ImageInput, 'hotspots'>[]): string[] {
  return [...new Set([...productIds, ...images.flatMap((i) => i.hotspots.map((h) => h.productId))])];
}
