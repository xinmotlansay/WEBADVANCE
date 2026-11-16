import { z } from 'zod';

/**
 * Vùng hiển thị của ảnh ngang: tâm cắt tính theo % (0–100) của ảnh gốc, dùng làm `object-position`.
 * Trống = căn giữa (50 / 50).
 */
export const imageFocusSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })
  .nullish();

export type ImageFocus = { x: number; y: number };
