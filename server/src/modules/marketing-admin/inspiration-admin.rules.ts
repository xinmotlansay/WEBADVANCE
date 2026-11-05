import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { imageUrl } from './collection-admin.rules.js';

/** Quy tắc MA-08 (Nguồn cảm hứng). Ảnh dùng chung giới hạn với Collection. */

export const MAX_INSPIRATION_PRODUCTS = 12;

const fields = {
  imageUrl,
  /** Bản nháp (Ẩn) được phép rỗng; muốn Hiện phải có ≥ 1. */
  productIds: z
    .array(z.string())
    .max(MAX_INSPIRATION_PRODUCTS, `Tối đa ${MAX_INSPIRATION_PRODUCTS} sản phẩm mỗi ảnh.`)
    .default([]),
};
export const inspirationSchema = z.object(fields);
export type InspirationInput = z.infer<typeof inspirationSchema>;
export const updateInspirationSchema = z.object({ ...fields, version: z.number().int().min(0) });
export type UpdateInspirationInput = z.infer<typeof updateInspirationSchema>;

/** E-MKT-021-02: popup khách không được rỗng. */
export function checkInspirationPublishable(products: number): void {
  if (products < 1) throw new AppError('E-MKT-021-02', 400, 'Cần ít nhất 1 sản phẩm trước khi hiển thị ảnh cảm hứng.');
}
