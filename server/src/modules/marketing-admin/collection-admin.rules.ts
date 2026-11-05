import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';

/** Quy tắc MA-07 (Collection). Hàm thuần để test không cần DB. */

export const MAX_PRODUCTS = 100;

const err = (code: string, message: string, status = 400) => new AppError(code, status, message);

/** Khác slug bài viết: collection có tên ngắn ("ODA" → "oda") nên cho từ 2 ký tự. */
export const isValidCollectionSlug = (s: string): boolean =>
  s.length >= 2 && s.length <= 160 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

const fields = {
  name: z.string().trim().min(2, 'Tên phải từ 2 đến 120 ký tự.').max(120, 'Tên phải từ 2 đến 120 ký tự.'),
  slug: z.string().trim().optional(),
  slogan: z.string().trim().max(120).default(''),
  shortDescription: z.string().trim().max(255).default(''),
  description: z.string().trim().max(5000).default(''),
  productIds: z.array(z.string()).max(MAX_PRODUCTS).default([]),
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
